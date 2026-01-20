import { LarkBaseClient, type LarkBaseRecord } from '../lark/client.js';
import type {
  Organization,
  Position,
  ApprovalRole,
  User,
  UserPosition,
  UserApprovalRole,
  WorkflowDefinition,
  WorkflowWithSteps,
  ApprovalStep,
  Request,
  ApprovalHistory,
} from '../models/index.js';

// テーブルID設定
const TABLES = {
  organizations: process.env.LARK_TABLE_ORGANIZATIONS ?? 'tblCnyU5rDlwsFCd',
  positions: process.env.LARK_TABLE_POSITIONS ?? 'tblvNSExDwSQLTl4',
  approvalRoles: process.env.LARK_TABLE_APPROVAL_ROLES ?? 'tblexuWyCZJQVsUt',
  users: process.env.LARK_TABLE_USERS ?? 'tblKjUDl9ysBlZot',
  userPositions: process.env.LARK_TABLE_USER_POSITIONS ?? 'tblGSAYD0p99ZpEf',
  userApprovalRoles: process.env.LARK_TABLE_USER_APPROVAL_ROLES ?? 'tblbHimZpnz1tKzB',
  workflowDefinitions: process.env.LARK_TABLE_WORKFLOWS ?? 'tbloV9BwBTySxhzp',
  approvalSteps: process.env.LARK_TABLE_APPROVAL_STEPS ?? 'tbls8HxUObebzsFl',
  requests: process.env.LARK_TABLE_REQUESTS ?? 'tblU94oqwhezq03A',
  approvalHistory: process.env.LARK_TABLE_APPROVAL_HISTORY ?? 'tblkIFM69oDD8nqY',
};

export class LarkBaseRepository {
  private client: LarkBaseClient;

  constructor(appToken: string) {
    this.client = new LarkBaseClient({ appToken });
  }

  // ==================== 組織 ====================
  async listOrganizations(): Promise<Organization[]> {
    const records = await this.client.getAllRecords(TABLES.organizations);
    return records.map((r) => this.mapOrganization(r));
  }

  async getOrganization(id: string): Promise<Organization | null> {
    const records = await this.client.getAllRecords(TABLES.organizations);
    const record = records.find((r) => r.record_id === id || r.fields.code === id);
    return record ? this.mapOrganization(record) : null;
  }

  private mapOrganization(record: LarkBaseRecord): Organization {
    return {
      id: record.record_id!,
      code: String(record.fields.code ?? ''),
      name: String(record.fields.name ?? ''),
      level: String(record.fields.level ?? 'section') as Organization['level'],
      parentId: String(record.fields.parent_code ?? '') || null,
      isActive: Boolean(record.fields.is_active),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // ==================== 役職 ====================
  async listPositions(): Promise<Position[]> {
    const records = await this.client.getAllRecords(TABLES.positions);
    return records.map((r) => this.mapPosition(r));
  }

  async getPosition(id: string): Promise<Position | null> {
    const records = await this.client.getAllRecords(TABLES.positions);
    const record = records.find((r) => r.record_id === id || r.fields.name === id);
    return record ? this.mapPosition(record) : null;
  }

  private mapPosition(record: LarkBaseRecord): Position {
    return {
      id: record.record_id!,
      name: String(record.fields.name ?? ''),
      level: Number(record.fields.level ?? 5),
      isActive: Boolean(record.fields.is_active),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // ==================== 承認ロール ====================
  async listApprovalRoles(): Promise<ApprovalRole[]> {
    const records = await this.client.getAllRecords(TABLES.approvalRoles);
    return records.map((r) => this.mapApprovalRole(r));
  }

  async getApprovalRole(id: string): Promise<ApprovalRole | null> {
    const records = await this.client.getAllRecords(TABLES.approvalRoles);
    const record = records.find((r) => r.record_id === id || r.fields.name === id);
    return record ? this.mapApprovalRole(record) : null;
  }

  private mapApprovalRole(record: LarkBaseRecord): ApprovalRole {
    return {
      id: record.record_id!,
      name: String(record.fields.name ?? ''),
      description: String(record.fields.description ?? ''),
      isActive: Boolean(record.fields.is_active),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // ==================== ユーザー ====================
  async listUsers(): Promise<User[]> {
    const records = await this.client.getAllRecords(TABLES.users);
    return records.map((r) => this.mapUser(r));
  }

  async getUser(id: string): Promise<User | null> {
    const records = await this.client.getAllRecords(TABLES.users);
    const record = records.find((r) => r.record_id === id || r.fields.lark_user_id === id);
    return record ? this.mapUser(record) : null;
  }

  async getUserByLarkId(larkUserId: string): Promise<User | null> {
    const records = await this.client.getAllRecords(TABLES.users);
    const record = records.find((r) => r.fields.lark_user_id === larkUserId);
    return record ? this.mapUser(record) : null;
  }

  private mapUser(record: LarkBaseRecord): User {
    return {
      id: record.record_id!,
      larkUserId: String(record.fields.lark_user_id ?? ''),
      name: String(record.fields.name ?? ''),
      email: String(record.fields.email ?? ''),
      isActive: Boolean(record.fields.is_active),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // ==================== ユーザー役職 ====================
  async getUserPositions(userId: string): Promise<UserPosition[]> {
    const records = await this.client.getAllRecords(TABLES.userPositions);
    const user = await this.getUser(userId);
    const larkUserId = user?.larkUserId ?? userId;

    return records
      .filter((r) => r.fields.user_id === larkUserId)
      .map((r) => this.mapUserPosition(r, user?.id ?? userId));
  }

  async getUsersByOrganizationAndPosition(
    organizationCode: string,
    positionName: string
  ): Promise<User[]> {
    const userPositions = await this.client.getAllRecords(TABLES.userPositions);
    const matching = userPositions.filter(
      (up) => up.fields.organization_code === organizationCode && up.fields.position_name === positionName
    );

    const users: User[] = [];
    for (const up of matching) {
      const user = await this.getUserByLarkId(String(up.fields.user_id ?? ''));
      if (user) users.push(user);
    }
    return users;
  }

  private mapUserPosition(record: LarkBaseRecord, userId: string): UserPosition {
    return {
      id: record.record_id!,
      userId,
      organizationId: String(record.fields.organization_code ?? ''),
      positionId: String(record.fields.position_name ?? ''),
      isPrimary: Boolean(record.fields.is_primary),
      validFrom: new Date(Number(record.fields.valid_from ?? Date.now())),
      validTo: record.fields.valid_to ? new Date(Number(record.fields.valid_to)) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // ==================== ユーザー承認ロール ====================
  async getUserApprovalRoles(userId: string): Promise<UserApprovalRole[]> {
    const records = await this.client.getAllRecords(TABLES.userApprovalRoles);
    const user = await this.getUser(userId);
    const larkUserId = user?.larkUserId ?? userId;

    return records
      .filter((r) => r.fields.user_id === larkUserId)
      .map((r) => this.mapUserApprovalRole(r, user?.id ?? userId));
  }

  async getUsersByApprovalRole(roleName: string): Promise<User[]> {
    const userRoles = await this.client.getAllRecords(TABLES.userApprovalRoles);
    const matching = userRoles.filter((ur) => ur.fields.approval_role_name === roleName);

    const users: User[] = [];
    for (const ur of matching) {
      const user = await this.getUserByLarkId(String(ur.fields.user_id ?? ''));
      if (user) users.push(user);
    }
    return users;
  }

  private mapUserApprovalRole(record: LarkBaseRecord, userId: string): UserApprovalRole {
    return {
      id: record.record_id!,
      userId,
      approvalRoleId: String(record.fields.approval_role_name ?? ''),
      targetOrganizationId: String(record.fields.target_organization_code ?? '') || null,
      validFrom: new Date(Number(record.fields.valid_from ?? Date.now())),
      validTo: record.fields.valid_to ? new Date(Number(record.fields.valid_to)) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // ==================== ワークフロー ====================
  async listWorkflows(category?: string): Promise<WorkflowDefinition[]> {
    const records = await this.client.getAllRecords(TABLES.workflowDefinitions);
    let filtered = records;
    if (category) {
      filtered = records.filter((r) => r.fields.category === category);
    }
    return filtered.map((r) => this.mapWorkflowDefinition(r));
  }

  async getWorkflow(id: string): Promise<WorkflowDefinition | null> {
    const records = await this.client.getAllRecords(TABLES.workflowDefinitions);
    const record = records.find((r) => r.record_id === id || r.fields.name === id);
    return record ? this.mapWorkflowDefinition(record) : null;
  }

  async getWorkflowWithSteps(id: string): Promise<WorkflowWithSteps | null> {
    const workflow = await this.getWorkflow(id);
    if (!workflow) return null;

    const steps = await this.getApprovalSteps(workflow.id);
    return { ...workflow, steps };
  }

  async createWorkflow(data: {
    name: string;
    description?: string;
    category?: string;
    formSchema?: unknown;
    isActive?: boolean;
  }): Promise<WorkflowDefinition> {
    const record = await this.client.createRecord(TABLES.workflowDefinitions, {
      name: data.name,
      description: data.description ?? '',
      category: data.category ?? '',
      form_schema: data.formSchema ? JSON.stringify(data.formSchema) : '',
      is_active: data.isActive ?? true,
    });
    return this.mapWorkflowDefinition(record);
  }

  async updateWorkflow(
    id: string,
    data: Partial<{ name: string; description: string; category: string; isActive: boolean }>
  ): Promise<WorkflowDefinition> {
    const fields: Record<string, unknown> = {};
    if (data.name !== undefined) fields.name = data.name;
    if (data.description !== undefined) fields.description = data.description;
    if (data.category !== undefined) fields.category = data.category;
    if (data.isActive !== undefined) fields.is_active = data.isActive;

    const record = await this.client.updateRecord(TABLES.workflowDefinitions, id, fields);
    return this.mapWorkflowDefinition(record);
  }

  async deleteWorkflow(id: string): Promise<void> {
    // 関連する承認ステップも削除
    const steps = await this.getApprovalSteps(id);
    for (const step of steps) {
      await this.client.deleteRecord(TABLES.approvalSteps, step.id);
    }
    await this.client.deleteRecord(TABLES.workflowDefinitions, id);
  }

  private mapWorkflowDefinition(record: LarkBaseRecord): WorkflowDefinition {
    const category = String(record.fields.category ?? '');
    const formSchema = this.getFormSchemaByCategory(category);

    return {
      id: record.record_id!,
      name: String(record.fields.name ?? ''),
      description: String(record.fields.description ?? ''),
      category,
      formSchema,
      isActive: Boolean(record.fields.is_active),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // カテゴリ別のフォームスキーマ定義
  private getFormSchemaByCategory(category: string) {
    const schemas: Record<string, unknown> = {
      '経費精算': {
        fields: [
          { name: 'amount', label: '金額', type: 'number', required: true, placeholder: '金額を入力', validation: { min: 1 } },
          { name: 'expenseDate', label: '支出日', type: 'date', required: true },
          { name: 'category', label: '経費区分', type: 'select', required: true, options: [
            { value: 'travel', label: '交通費' },
            { value: 'entertainment', label: '交際費' },
            { value: 'supplies', label: '消耗品費' },
            { value: 'communication', label: '通信費' },
            { value: 'other', label: 'その他' },
          ]},
          { name: 'description', label: '内容・目的', type: 'textarea', required: true, placeholder: '経費の内容と目的を入力' },
          { name: 'receipt', label: '領収書添付', type: 'checkbox', required: false },
        ],
      },
      '休暇申請': {
        fields: [
          { name: 'leaveType', label: '休暇種別', type: 'select', required: true, options: [
            { value: 'paid', label: '有給休暇' },
            { value: 'special', label: '特別休暇' },
            { value: 'substitute', label: '代休' },
            { value: 'unpaid', label: '欠勤' },
          ]},
          { name: 'startDate', label: '開始日', type: 'date', required: true },
          { name: 'endDate', label: '終了日', type: 'date', required: true },
          { name: 'reason', label: '理由', type: 'textarea', required: false, placeholder: '休暇の理由（任意）' },
        ],
      },
      '稟議': {
        fields: [
          { name: 'amount', label: '金額', type: 'number', required: true, placeholder: '金額を入力' },
          { name: 'purpose', label: '目的', type: 'text', required: true, placeholder: '稟議の目的を入力' },
          { name: 'detail', label: '詳細', type: 'textarea', required: true, placeholder: '稟議の詳細を入力' },
          { name: 'deadline', label: '希望期日', type: 'date', required: false },
        ],
      },
    };

    return schemas[category] || null;
  }

  // ==================== 承認ステップ ====================
  async getApprovalSteps(workflowId: string): Promise<ApprovalStep[]> {
    const records = await this.client.getAllRecords(TABLES.approvalSteps);
    return records
      .filter((r) => r.fields.workflow_id === workflowId)
      .map((r) => this.mapApprovalStep(r))
      .sort((a, b) => a.stepOrder - b.stepOrder);
  }

  async createApprovalStep(
    workflowId: string,
    data: {
      stepOrder: number;
      stepType: 'position' | 'role' | 'specific_user';
      positionName?: string;
      approvalRoleName?: string;
      specificUserId?: string;
      label: string;
      isRequired?: boolean;
      skipIfSamePerson?: boolean;
      skipIfVacant?: boolean;
    }
  ): Promise<ApprovalStep> {
    const record = await this.client.createRecord(TABLES.approvalSteps, {
      workflow_id: workflowId,
      step_order: data.stepOrder,
      step_type: data.stepType,
      position_name: data.positionName ?? '',
      approval_role_name: data.approvalRoleName ?? '',
      specific_user_id: data.specificUserId ?? '',
      label: data.label,
      is_required: data.isRequired ?? true,
      skip_if_same_person: data.skipIfSamePerson ?? true,
      skip_if_vacant: data.skipIfVacant ?? false,
    });
    return this.mapApprovalStep(record);
  }

  async updateApprovalStep(id: string, data: Partial<ApprovalStep>): Promise<ApprovalStep> {
    const fields: Record<string, unknown> = {};
    if (data.stepOrder !== undefined) fields.step_order = data.stepOrder;
    if (data.stepType !== undefined) fields.step_type = data.stepType;
    if (data.label !== undefined) fields.label = data.label;
    if (data.isRequired !== undefined) fields.is_required = data.isRequired;
    if (data.skipIfSamePerson !== undefined) fields.skip_if_same_person = data.skipIfSamePerson;
    if (data.skipIfVacant !== undefined) fields.skip_if_vacant = data.skipIfVacant;

    const record = await this.client.updateRecord(TABLES.approvalSteps, id, fields);
    return this.mapApprovalStep(record);
  }

  async deleteApprovalStep(id: string): Promise<void> {
    await this.client.deleteRecord(TABLES.approvalSteps, id);
  }

  private mapApprovalStep(record: LarkBaseRecord): ApprovalStep {
    return {
      id: record.record_id!,
      workflowId: String(record.fields.workflow_id ?? ''),
      stepOrder: Number(record.fields.step_order ?? 0),
      stepType: String(record.fields.step_type ?? 'position') as ApprovalStep['stepType'],
      positionId: String(record.fields.position_name ?? '') || null,
      approvalRoleId: String(record.fields.approval_role_name ?? '') || null,
      specificUserId: String(record.fields.specific_user_id ?? '') || null,
      label: String(record.fields.label ?? ''),
      isRequired: Boolean(record.fields.is_required),
      skipIfSamePerson: Boolean(record.fields.skip_if_same_person),
      skipIfVacant: Boolean(record.fields.skip_if_vacant),
      conditions: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // ==================== 申請 ====================
  async listRequests(options?: {
    status?: string;
    applicantId?: string;
    workflowId?: string;
  }): Promise<Request[]> {
    const records = await this.client.getAllRecords(TABLES.requests);
    let filtered = records;

    if (options?.status) {
      filtered = filtered.filter((r) => r.fields.status === options.status);
    }
    if (options?.applicantId) {
      filtered = filtered.filter((r) => r.fields.applicant_id === options.applicantId);
    }
    if (options?.workflowId) {
      filtered = filtered.filter((r) => r.fields.workflow_id === options.workflowId);
    }

    return filtered.map((r) => this.mapRequest(r));
  }

  async getRequest(id: string): Promise<Request | null> {
    const records = await this.client.getAllRecords(TABLES.requests);
    const record = records.find((r) => r.record_id === id);
    return record ? this.mapRequest(record) : null;
  }

  async createRequest(data: {
    workflowId: string;
    applicantId: string;
    applicantOrganizationId: string;
    title: string;
    content: Record<string, unknown>;
  }): Promise<Request> {
    const record = await this.client.createRecord(TABLES.requests, {
      workflow_id: data.workflowId,
      applicant_id: data.applicantId,
      applicant_org_code: data.applicantOrganizationId,
      title: data.title,
      content: JSON.stringify(data.content),
      status: 'draft',
      current_step: 0,
    });
    return this.mapRequest(record);
  }

  async updateRequest(
    id: string,
    data: Partial<{
      title: string;
      content: Record<string, unknown>;
      status: string;
      currentStep: number;
      submittedAt: Date;
      completedAt: Date;
    }>
  ): Promise<Request> {
    const fields: Record<string, unknown> = {};
    if (data.title !== undefined) fields.title = data.title;
    if (data.content !== undefined) fields.content = JSON.stringify(data.content);
    if (data.status !== undefined) fields.status = data.status;
    if (data.currentStep !== undefined) fields.current_step = data.currentStep;
    if (data.submittedAt !== undefined) fields.submitted_at = data.submittedAt.getTime();
    if (data.completedAt !== undefined) fields.completed_at = data.completedAt.getTime();

    const record = await this.client.updateRecord(TABLES.requests, id, fields);
    return this.mapRequest(record);
  }

  private mapRequest(record: LarkBaseRecord): Request {
    let content: Record<string, unknown> = {};
    try {
      content = JSON.parse(String(record.fields.content ?? '{}'));
    } catch {
      content = {};
    }

    return {
      id: record.record_id!,
      workflowId: String(record.fields.workflow_id ?? ''),
      applicantId: String(record.fields.applicant_id ?? ''),
      applicantOrganizationId: String(record.fields.applicant_org_code ?? ''),
      title: String(record.fields.title ?? ''),
      content,
      status: String(record.fields.status ?? 'draft') as Request['status'],
      currentStep: Number(record.fields.current_step ?? 0),
      submittedAt: record.fields.submitted_at ? new Date(Number(record.fields.submitted_at)) : null,
      completedAt: record.fields.completed_at ? new Date(Number(record.fields.completed_at)) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // ==================== 承認履歴 ====================
  async getApprovalHistory(requestId: string): Promise<ApprovalHistory[]> {
    const records = await this.client.getAllRecords(TABLES.approvalHistory);
    return records
      .filter((r) => r.fields.request_id === requestId)
      .map((r) => this.mapApprovalHistory(r))
      .sort((a, b) => a.stepOrder - b.stepOrder);
  }

  async createApprovalHistory(data: {
    requestId: string;
    stepOrder: number;
    approverId: string;
    action: 'approve' | 'reject' | 'remand' | 'skip';
    comment?: string;
    skipReason?: string;
  }): Promise<ApprovalHistory> {
    const record = await this.client.createRecord(TABLES.approvalHistory, {
      request_id: data.requestId,
      step_order: data.stepOrder,
      approver_id: data.approverId,
      action: data.action,
      comment: data.comment ?? '',
      skip_reason: data.skipReason ?? '',
    });
    return this.mapApprovalHistory(record);
  }

  private mapApprovalHistory(record: LarkBaseRecord): ApprovalHistory {
    return {
      id: record.record_id!,
      requestId: String(record.fields.request_id ?? ''),
      stepOrder: Number(record.fields.step_order ?? 0),
      approverId: String(record.fields.approver_id ?? '') || null,
      action: String(record.fields.action ?? 'approve') as ApprovalHistory['action'],
      comment: String(record.fields.comment ?? '') || null,
      skipReason: (String(record.fields.skip_reason ?? '') || null) as ApprovalHistory['skipReason'],
      createdAt: new Date(),
    };
  }
}

// シングルトンインスタンス
let repository: LarkBaseRepository | null = null;

export function getRepository(): LarkBaseRepository {
  if (!repository) {
    const appToken = process.env.LARK_BASE_APP_TOKEN;
    if (!appToken) {
      throw new Error('LARK_BASE_APP_TOKEN is not set');
    }
    repository = new LarkBaseRepository(appToken);
  }
  return repository;
}
