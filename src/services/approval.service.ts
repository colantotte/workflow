import type {
  User,
  UserPosition,
  UserApprovalRole,
  Organization,
  Position,
  ApprovalStep,
  WorkflowWithSteps,
  WorkflowDefinition,
  Request,
  ApprovalHistory,
  ResolvedApprovalStep,
  ApproverStatus,
  StepApprovalStatus,
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
  // Phase 1: ステップ承認状況
  getStepApprovalStatuses?(requestId: string, stepOrder?: number): Promise<StepApprovalStatus[]>;
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

  /**
   * 複数承認者のステップの解決状態を評価する
   * returns: 'pending' | 'approved' | 'rejected'
   */
  resolveMultiApproverStatus(
    statuses: StepApprovalStatus[],
    mode: string,
    requiredCount: number | null
  ): 'pending' | 'approved' | 'rejected' {
    if (statuses.length === 0) return 'pending';

    const approved = statuses.filter((s) => s.status === 'approved');
    const rejected = statuses.filter((s) => s.status === 'rejected');
    const pending = statuses.filter((s) => s.status === 'pending');

    switch (mode) {
      case 'single':
        // 1人でも承認すればOK
        if (approved.length > 0) return 'approved';
        if (rejected.length > 0 && pending.length === 0) return 'rejected';
        return 'pending';

      case 'all':
        // 全員承認が必要
        if (rejected.length > 0) return 'rejected';
        if (pending.length === 0 && approved.length === statuses.length) return 'approved';
        return 'pending';

      case 'group':
        // N人以上の承認が必要
        const required = requiredCount ?? statuses.length;
        if (approved.length >= required) return 'approved';
        // 残りの承認者全員が承認しても足りない場合は却下
        if (approved.length + pending.length < required) return 'rejected';
        return 'pending';

      case 'notify':
        // 通知のみ（常に承認扱い）
        return 'approved';

      default:
        return 'pending';
    }
  }

  /**
   * 引き上げ可否判定
   * 上位の承認者（後のステップ）が現在のステップを引き上げ可能か
   */
  async canPullUp(
    userId: string,
    context: ApprovalContext
  ): Promise<boolean> {
    if (!context.workflow.allowPullUp) return false;

    const route = await this.resolveApprovalRoute(context);
    const currentStep = context.request.currentStep;

    // ユーザーが後のステップの承認者であるか確認
    for (const step of route) {
      if (step.stepOrder > currentStep && step.approver?.id === userId) {
        return true;
      }
    }
    return false;
  }

  /**
   * 差戻処理（3モード対応）
   * returns: 差戻先のステップ番号
   */
  processRemandTarget(
    remandMode: string,
    currentStep: number,
    targetStep?: number
  ): number {
    switch (remandMode) {
      case 'require_reapproval':
        // 経路最初（申請者）に戻す
        return 0;

      case 'choose_at_remand':
        // 差戻時に選択された先に戻す
        return targetStep ?? 0;

      case 'no_reapproval':
        // 差戻先から再開（直前のステップに戻す）
        return Math.max(0, currentStep - 1);

      default:
        return 0;
    }
  }

  /**
   * 自動採番を生成する
   */
  generateDocNumber(format: string, nextNumber: number): string {
    const now = new Date();
    let result = format;

    // %Y → 年
    result = result.replace(/%Y/g, String(now.getFullYear()));
    // %m → 月（ゼロ埋め）
    result = result.replace(/%m/g, String(now.getMonth() + 1).padStart(2, '0'));
    // %d → 日
    result = result.replace(/%d/g, String(now.getDate()).padStart(2, '0'));

    // %N%N%N... → 連番（%Nの数でゼロ埋め桁数を決定）
    const nMatch = result.match(/(%N)+/);
    if (nMatch) {
      const digits = nMatch[0].length / 2; // %N は2文字
      const numStr = String(nextNumber).padStart(digits, '0');
      result = result.replace(/(%N)+/, numStr);
    }

    return result;
  }

  /**
   * 閲覧権限チェック
   */
  async canViewRequest(
    userId: string,
    request: Request,
    workflow: WorkflowDefinition,
    context?: ApprovalContext
  ): Promise<boolean> {
    const restriction = workflow.viewingRestriction ?? 'all';

    switch (restriction) {
      case 'all':
        return true;

      case 'route_members':
        // 申請者
        if (request.applicantId === userId) return true;
        // 経路メンバー
        if (context) {
          const route = await this.resolveApprovalRoute(context);
          return route.some((step) => step.approver?.id === userId);
        }
        return false;

      case 'department':
        // 同一部署チェック（簡易版）
        if (request.applicantId === userId) return true;
        // TODO: 部署チェック実装
        return true;

      case 'specified_users':
        if (request.applicantId === userId) return true;
        return (workflow.viewingAllowedUsers ?? []).includes(userId);

      default:
        return true;
    }
  }

  /**
   * ステップの複数承認者を検索する
   */
  async findApprovers(
    step: ApprovalStep,
    context: ApprovalContext
  ): Promise<User[]> {
    switch (step.stepType) {
      case 'position':
        if (!step.positionId) return [];
        return this.dataStore.getUsersByOrganizationAndPosition(
          context.applicantOrganization.id,
          step.positionId,
          context.currentDate
        );

      case 'role':
        if (!step.approvalRoleId) return [];
        return this.dataStore.getUsersByApprovalRole(
          step.approvalRoleId,
          context.applicantOrganization.id,
          context.currentDate
        );

      case 'specific_user':
        if (!step.specificUserId) return [];
        const user = await this.dataStore.getUser(step.specificUserId);
        return user ? [user] : [];

      default:
        return [];
    }
  }

  /**
   * ワークフローに対して最適な経路マスタを選択する
   * 優先度: individual(4) > department(3) > position(2) > basic(1)
   */
  selectRoute(
    routeMasters: Array<{ routeType: string; priority: number; targetPositionId: string | null; targetDepartmentId: string | null; targetUserId: string | null; isActive: boolean; conditions: Array<{ field: string; operator: string; value: string | number | boolean }> | null }>,
    applicantId: string,
    applicantPositionId: string | null,
    applicantOrganizationId: string,
    formContent?: Record<string, unknown>
  ): typeof routeMasters[number] | null {
    const active = routeMasters.filter(r => r.isActive);
    if (active.length === 0) return null;

    // マッチするルートをフィルタ
    const matched = active.filter(r => {
      switch (r.routeType) {
        case 'by_individual':
          return r.targetUserId === applicantId;
        case 'by_department':
          return r.targetDepartmentId === applicantOrganizationId;
        case 'by_position':
          return r.targetPositionId === applicantPositionId;
        case 'basic':
          return true;
        default:
          return false;
      }
      // 条件チェック（formContentベース）
    }).filter(r => {
      if (!r.conditions || r.conditions.length === 0) return true;
      if (!formContent) return false;
      return r.conditions.every(cond => {
        const val = formContent[cond.field];
        return this.evaluateConditionValue(val, cond.operator, cond.value);
      });
    });

    if (matched.length === 0) return null;

    // 優先度でソート（高い優先度が先）
    matched.sort((a, b) => b.priority - a.priority);
    return matched[0];
  }

  private evaluateConditionValue(
    actual: unknown,
    operator: string,
    expected: string | number | boolean
  ): boolean {
    if (actual === undefined || actual === null) return false;
    const numActual = typeof actual === 'number' ? actual : Number(actual);
    const numExpected = typeof expected === 'number' ? expected : Number(expected);
    switch (operator) {
      case 'eq': return actual === expected || numActual === numExpected;
      case 'neq': return actual !== expected && numActual !== numExpected;
      case 'gt': return numActual > numExpected;
      case 'gte': return numActual >= numExpected;
      case 'lt': return numActual < numExpected;
      case 'lte': return numActual <= numExpected;
      case 'contains': return String(actual).includes(String(expected));
      default: return false;
    }
  }
}
