import type {
  User,
  UserPosition,
  UserApprovalRole,
  Organization,
  Position,
  ApprovalStep,
  WorkflowWithSteps,
  Request,
  ApprovalHistory,
  ResolvedApprovalStep,
  SkipReason,
  StepCondition,
} from '../models/index.js';

// データストア（実際の実装ではLark Baseから取得）
export interface DataStore {
  getUser(id: string): Promise<User | null>;
  getUserByLarkId(larkUserId: string): Promise<User | null>;
  getUserPositions(userId: string, date?: Date): Promise<UserPosition[]>;
  getUserApprovalRoles(userId: string, date?: Date): Promise<UserApprovalRole[]>;
  getOrganization(id: string): Promise<Organization | null>;
  getPosition(id: string): Promise<Position | null>;
  getUsersByOrganizationAndPosition(
    organizationId: string,
    positionId: string,
    date?: Date
  ): Promise<User[]>;
  getUsersByApprovalRole(
    approvalRoleId: string,
    targetOrganizationId?: string | null,
    date?: Date
  ): Promise<User[]>;
  getWorkflowWithSteps(workflowId: string): Promise<WorkflowWithSteps | null>;
  getApprovalHistory(requestId: string): Promise<ApprovalHistory[]>;
}

export interface ApprovalContext {
  request: Request;
  applicant: User;
  applicantOrganization: Organization;
  workflow: WorkflowWithSteps;
  currentDate: Date;
}

export class ApprovalService {
  constructor(private readonly dataStore: DataStore) {}

  /**
   * 承認ルートを解決する（スキップロジック適用済み）
   */
  async resolveApprovalRoute(
    context: ApprovalContext
  ): Promise<ResolvedApprovalStep[]> {
    const { workflow, request } = context;
    const resolvedSteps: ResolvedApprovalStep[] = [];
    const previousApproverIds: string[] = [];

    // 承認履歴を取得
    const history = await this.dataStore.getApprovalHistory(request.id);
    const historyByStep = new Map<number, ApprovalHistory>();
    for (const h of history) {
      historyByStep.set(h.stepOrder, h);
    }

    // 各ステップを順に解決
    for (const step of workflow.steps.sort((a, b) => a.stepOrder - b.stepOrder)) {
      const resolved = await this.resolveStep(
        step,
        context,
        previousApproverIds,
        historyByStep.get(step.stepOrder)
      );

      resolvedSteps.push(resolved);

      // 承認済みの場合、承認者IDを記録（兼務スキップ用）
      if (resolved.approver && resolved.status === 'approved') {
        previousApproverIds.push(resolved.approver.id);
      }
    }

    return resolvedSteps;
  }

  /**
   * 単一ステップを解決する
   */
  private async resolveStep(
    step: ApprovalStep,
    context: ApprovalContext,
    previousApproverIds: string[],
    existingHistory?: ApprovalHistory
  ): Promise<ResolvedApprovalStep> {
    // 既に処理済みの場合
    if (existingHistory) {
      const approver = existingHistory.approverId
        ? await this.dataStore.getUser(existingHistory.approverId)
        : null;

      return {
        stepOrder: step.stepOrder,
        stepType: step.stepType,
        label: step.label,
        approver: approver
          ? { id: approver.id, name: approver.name, email: approver.email }
          : null,
        status:
          existingHistory.action === 'approve'
            ? 'approved'
            : existingHistory.action === 'reject'
              ? 'rejected'
              : 'skipped',
        skipReason: existingHistory.skipReason,
        comment: existingHistory.comment,
        processedAt: existingHistory.createdAt,
      };
    }

    // 条件チェック
    if (step.conditions && !this.evaluateConditions(step.conditions, context.request.content)) {
      return {
        stepOrder: step.stepOrder,
        stepType: step.stepType,
        label: step.label,
        approver: null,
        status: 'skipped',
        skipReason: 'not_required',
        comment: '条件に該当しないためスキップ',
        processedAt: null,
      };
    }

    // 承認者を解決
    const approver = await this.findApprover(step, context);

    // 空席スキップ
    if (!approver) {
      if (step.skipIfVacant) {
        return {
          stepOrder: step.stepOrder,
          stepType: step.stepType,
          label: step.label,
          approver: null,
          status: 'skipped',
          skipReason: 'vacant',
          comment: '該当者不在のためスキップ',
          processedAt: null,
        };
      }
      // 必須だが空席の場合はpending（要対応）
      return {
        stepOrder: step.stepOrder,
        stepType: step.stepType,
        label: step.label,
        approver: null,
        status: 'pending',
        skipReason: null,
        comment: '承認者が設定されていません',
        processedAt: null,
      };
    }

    // 兼務スキップ（同一人物が既に承認済み）
    if (step.skipIfSamePerson && previousApproverIds.includes(approver.id)) {
      return {
        stepOrder: step.stepOrder,
        stepType: step.stepType,
        label: step.label,
        approver: { id: approver.id, name: approver.name, email: approver.email },
        status: 'skipped',
        skipReason: 'same_person',
        comment: '同一承認者のためスキップ',
        processedAt: null,
      };
    }

    // 現在ステップかどうかで status を決定
    const status = context.request.currentStep === step.stepOrder ? 'pending' : 'waiting';

    return {
      stepOrder: step.stepOrder,
      stepType: step.stepType,
      label: step.label,
      approver: { id: approver.id, name: approver.name, email: approver.email },
      status,
      skipReason: null,
      comment: null,
      processedAt: null,
    };
  }

  /**
   * ステップに対する承認者を検索する
   */
  private async findApprover(
    step: ApprovalStep,
    context: ApprovalContext
  ): Promise<User | null> {
    switch (step.stepType) {
      case 'position':
        return this.findApproverByPosition(step, context);

      case 'role':
        return this.findApproverByRole(step, context);

      case 'specific_user':
        if (!step.specificUserId) return null;
        return this.dataStore.getUser(step.specificUserId);

      default:
        return null;
    }
  }

  /**
   * 役職ベースで承認者を検索（空席時は上位役職/上位組織へエスカレーション）
   */
  private async findApproverByPosition(
    step: ApprovalStep,
    context: ApprovalContext
  ): Promise<User | null> {
    if (!step.positionId) return null;

    const position = await this.dataStore.getPosition(step.positionId);
    if (!position) return null;

    // 申請者の組織から該当役職者を検索
    return this.findUserByPositionWithEscalation(
      context.applicantOrganization.id,
      position,
      context.currentDate
    );
  }

  /**
   * 役職者を検索（エスカレーション付き）
   */
  private async findUserByPositionWithEscalation(
    organizationId: string,
    position: Position,
    date: Date
  ): Promise<User | null> {
    // 現在組織で該当役職者を検索
    const users = await this.dataStore.getUsersByOrganizationAndPosition(
      organizationId,
      position.id,
      date
    );

    if (users.length > 0) {
      return users[0]; // 複数いる場合は最初の1人
    }

    // 空席の場合、上位役職を探す
    if (position.level > 1) {
      // より上位の役職（level が小さい）を検索
      // TODO: 実際の実装では Position テーブルから上位役職を取得
      return null;
    }

    // 上位組織を探す
    const org = await this.dataStore.getOrganization(organizationId);
    if (org?.parentId) {
      return this.findUserByPositionWithEscalation(org.parentId, position, date);
    }

    return null;
  }

  /**
   * 承認ロールベースで承認者を検索
   */
  private async findApproverByRole(
    step: ApprovalStep,
    context: ApprovalContext
  ): Promise<User | null> {
    if (!step.approvalRoleId) return null;

    // 申請者の組織を対象として検索
    const users = await this.dataStore.getUsersByApprovalRole(
      step.approvalRoleId,
      context.applicantOrganization.id,
      context.currentDate
    );

    if (users.length > 0) {
      return users[0];
    }

    // 組織指定なしのロール保持者を検索
    const globalUsers = await this.dataStore.getUsersByApprovalRole(
      step.approvalRoleId,
      null,
      context.currentDate
    );

    return globalUsers[0] ?? null;
  }

  /**
   * 条件を評価する
   */
  private evaluateConditions(
    conditions: StepCondition[],
    content: Record<string, unknown>
  ): boolean {
    // すべての条件がAND
    return conditions.every((condition) => this.evaluateCondition(condition, content));
  }

  private evaluateCondition(
    condition: StepCondition,
    content: Record<string, unknown>
  ): boolean {
    const fieldValue = content[condition.field];
    const targetValue = condition.value;

    switch (condition.operator) {
      case 'eq':
        return fieldValue === targetValue;
      case 'ne':
        return fieldValue !== targetValue;
      case 'gt':
        return typeof fieldValue === 'number' &&
          typeof targetValue === 'number' &&
          fieldValue > targetValue;
      case 'gte':
        return typeof fieldValue === 'number' &&
          typeof targetValue === 'number' &&
          fieldValue >= targetValue;
      case 'lt':
        return typeof fieldValue === 'number' &&
          typeof targetValue === 'number' &&
          fieldValue < targetValue;
      case 'lte':
        return typeof fieldValue === 'number' &&
          typeof targetValue === 'number' &&
          fieldValue <= targetValue;
      case 'in':
        return Array.isArray(targetValue) && targetValue.includes(fieldValue as string);
      default:
        return true;
    }
  }

  /**
   * 次の承認ステップを取得
   */
  async getNextPendingStep(
    context: ApprovalContext
  ): Promise<ResolvedApprovalStep | null> {
    const route = await this.resolveApprovalRoute(context);

    for (const step of route) {
      if (step.status === 'pending') {
        return step;
      }
    }

    return null;
  }

  /**
   * 承認ルートが完了しているかチェック
   */
  async isRouteCompleted(context: ApprovalContext): Promise<boolean> {
    const route = await this.resolveApprovalRoute(context);

    return route.every(
      (step) =>
        step.status === 'approved' ||
        step.status === 'skipped' ||
        (!step.approver && step.skipReason === 'vacant')
    );
  }
}
