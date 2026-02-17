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
  StepApprovalStatus,
  RouteMaster,
  RouteStep,
  RouteMasterWithSteps,
  ProxySetting,
} from '../models/index.js';
import { cached, cache } from '../utils/cache.js';

// テーブルID設定（遅延評価 - dotenv.config() 完了後に環境変数を読み取る）
let _tablesCache: Record<string, string> | null = null;
function tables(): Record<string, string> {
  if (!_tablesCache) {
    _tablesCache = {
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
      stepApprovalStatuses: process.env.LARK_TABLE_STEP_APPROVAL_STATUSES ?? '',
      routeMasters: process.env.LARK_TABLE_ROUTE_MASTERS ?? '',
      routeSteps: process.env.LARK_TABLE_ROUTE_STEPS ?? '',
      proxySettings: process.env.LARK_TABLE_PROXY_SETTINGS ?? '',
    };
  }
  return _tablesCache;
}
// TABLES proxy for lazy evaluation - reads env vars on first access
const TABLES = new Proxy({} as Record<string, string>, {
  get(_, prop: string) { return tables()[prop]; },
});

export class LarkBaseRepository {
  private client: LarkBaseClient;

  constructor(appToken: string) {
    this.client = new LarkBaseClient({ appToken });
  }

  // ==================== キャッシュ ====================
  clearCache(key?: string): void {
    if (key) {
      cache.deletePattern(key);
    } else {
      cache.clear();
    }
  }

  // ==================== 組織 ====================
  async listOrganizations(): Promise<Organization[]> {
    return cached('organizations:all', async () => {
      const records = await this.client.getAllRecords(TABLES.organizations);
      return records.map((r) => this.mapOrganization(r));
    }, 300); // 5分キャッシュ
  }

  async getOrganization(id: string): Promise<Organization | null> {
    const orgs = await this.listOrganizations();
    return orgs.find((o) => o.id === id || o.code === id) || null;
  }

  async createOrganization(data: {
    code: string;
    name: string;
    level: Organization['level'];
    parentCode?: string | null;
    isActive?: boolean;
  }): Promise<Organization> {
    const fields = {
      code: data.code,
      name: data.name,
      level: data.level,
      parent_code: data.parentCode ?? '',
      is_active: data.isActive ?? true,
    };
    const record = await this.client.createRecord(TABLES.organizations, fields);
    return this.mapOrganization(record);
  }

  async updateOrganization(id: string, data: Partial<{
    code: string;
    name: string;
    level: Organization['level'];
    parentCode: string | null;
    isActive: boolean;
  }>): Promise<Organization> {
    const fields: Record<string, unknown> = {};
    if (data.code !== undefined) fields.code = data.code;
    if (data.name !== undefined) fields.name = data.name;
    if (data.level !== undefined) fields.level = data.level;
    if (data.parentCode !== undefined) fields.parent_code = data.parentCode ?? '';
    if (data.isActive !== undefined) fields.is_active = data.isActive;
    const record = await this.client.updateRecord(TABLES.organizations, id, fields);
    return this.mapOrganization(record);
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
    return cached('positions:all', async () => {
      const records = await this.client.getAllRecords(TABLES.positions);
      return records.map((r) => this.mapPosition(r));
    }, 300); // 5分キャッシュ
  }

  async getPosition(id: string): Promise<Position | null> {
    const positions = await this.listPositions();
    return positions.find((p) => p.id === id || p.name === id) || null;
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
    return cached('approvalRoles:all', async () => {
      const records = await this.client.getAllRecords(TABLES.approvalRoles);
      return records.map((r) => this.mapApprovalRole(r));
    }, 300); // 5分キャッシュ
  }

  async getApprovalRole(id: string): Promise<ApprovalRole | null> {
    const roles = await this.listApprovalRoles();
    return roles.find((r) => r.id === id || r.name === id) || null;
  }

  async createApprovalRole(data: {
    name: string;
    description?: string;
    isActive?: boolean;
  }): Promise<ApprovalRole> {
    const record = await this.client.createRecord(TABLES.approvalRoles, {
      name: data.name,
      description: data.description ?? '',
      is_active: data.isActive ?? true,
    });
    this.clearCache('approvalRoles');
    return this.mapApprovalRole(record);
  }

  async updateApprovalRole(id: string, data: Partial<{
    name: string;
    description: string;
    isActive: boolean;
  }>): Promise<ApprovalRole> {
    const fields: Record<string, unknown> = {};
    if (data.name !== undefined) fields.name = data.name;
    if (data.description !== undefined) fields.description = data.description;
    if (data.isActive !== undefined) fields.is_active = data.isActive;
    const record = await this.client.updateRecord(TABLES.approvalRoles, id, fields);
    this.clearCache('approvalRoles');
    return this.mapApprovalRole(record);
  }

  async deleteApprovalRole(id: string): Promise<void> {
    await this.client.deleteRecord(TABLES.approvalRoles, id);
    this.clearCache('approvalRoles');
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
    return cached('users:all', async () => {
      const records = await this.client.getAllRecords(TABLES.users);
      const users = records.map((r) => this.mapUser(r));
      // larkUserId で重複排除（Lark Base のデータ重複対策）
      const seen = new Set<string>();
      return users.filter((u) => {
        const key = u.larkUserId || u.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }, 120); // 2分キャッシュ
  }

  async getUser(id: string): Promise<User | null> {
    const users = await this.listUsers();
    return users.find((u) => u.id === id || u.larkUserId === id) || null;
  }

  async getUserByLarkId(larkUserId: string): Promise<User | null> {
    const users = await this.listUsers();
    return users.find((u) => u.larkUserId === larkUserId) || null;
  }

  async createUser(data: {
    larkUserId: string;
    name: string;
    email: string;
    role?: User['role'];
    isActive?: boolean;
  }): Promise<User> {
    const fields = {
      lark_user_id: data.larkUserId,
      name: data.name,
      email: data.email,
      role: data.role ?? 'user',
      is_active: data.isActive ?? true,
    };
    const record = await this.client.createRecord(TABLES.users, fields);
    return this.mapUser(record);
  }

  async updateUser(id: string, data: Partial<{
    name: string;
    email: string;
    role: User['role'];
    isActive: boolean;
  }>): Promise<User> {
    const fields: Record<string, unknown> = {};
    if (data.name !== undefined) fields.name = data.name;
    if (data.email !== undefined) fields.email = data.email;
    if (data.role !== undefined) fields.role = data.role;
    if (data.isActive !== undefined) fields.is_active = data.isActive;
    const record = await this.client.updateRecord(TABLES.users, id, fields);
    return this.mapUser(record);
  }

  private mapUser(record: LarkBaseRecord): User {
    const role = String(record.fields.role ?? 'user');
    return {
      id: record.record_id!,
      larkUserId: String(record.fields.lark_user_id ?? ''),
      name: String(record.fields.name ?? ''),
      email: String(record.fields.email ?? ''),
      role: (['admin', 'manager', 'user'].includes(role) ? role : 'user') as User['role'],
      isActive: Boolean(record.fields.is_active),
      sealImageUrl: String(record.fields.seal_image_url ?? '') || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // ==================== ユーザー役職 ====================
  private async getAllUserPositions(): Promise<LarkBaseRecord[]> {
    return cached('userPositions:all', async () => {
      return this.client.getAllRecords(TABLES.userPositions);
    }, 120); // 2分キャッシュ
  }

  // リンクフィールドからユーザーIDを取得するヘルパー
  private getUserIdFromLink(linkField: unknown): string | null {
    if (!linkField) return null;
    // リンクフィールドは配列形式: [{ record_ids: ["recXXX"] }] または { link_record_ids: ["recXXX"] }
    if (Array.isArray(linkField) && linkField.length > 0) {
      const first = linkField[0];
      if (typeof first === 'string') return first;
      if (first?.record_ids?.[0]) return first.record_ids[0];
      if (first?.link_record_ids?.[0]) return first.link_record_ids[0];
      if (first?.text) return first.text; // テキスト表示の場合
    }
    if (typeof linkField === 'object' && linkField !== null) {
      const obj = linkField as Record<string, unknown>;
      if (obj.link_record_ids && Array.isArray(obj.link_record_ids)) {
        return obj.link_record_ids[0] as string;
      }
    }
    return null;
  }

  async getUserPositions(userId: string): Promise<UserPosition[]> {
    const records = await this.getAllUserPositions();

    // user_link（リンクフィールド）または user_id（旧フィールド）でフィルタ
    return records
      .filter((r) => {
        const linkedUserId = this.getUserIdFromLink(r.fields.user_link);
        if (linkedUserId) {
          return linkedUserId === userId;
        }
        // フォールバック: 旧 user_id フィールド
        const user = this.getCachedUserById(userId);
        return r.fields.user_id === user?.larkUserId;
      })
      .map((r) => this.mapUserPosition(r, userId));
  }

  // キャッシュからユーザーを同期的に取得（既にロード済みの場合）
  private getCachedUserById(userId: string): User | null {
    const users = cache.get<User[]>('users:all');
    if (!users) return null;
    return users.find((u) => u.id === userId || u.larkUserId === userId) || null;
  }

  async getUsersByOrganizationAndPosition(
    organizationCode: string,
    positionName: string
  ): Promise<User[]> {
    const userPositions = await this.getAllUserPositions();
    const matching = userPositions.filter(
      (up) => up.fields.organization_code === organizationCode && up.fields.position_name === positionName
    );

    const users: User[] = [];
    for (const up of matching) {
      // user_link（リンクフィールド）を優先
      const linkedUserId = this.getUserIdFromLink(up.fields.user_link);
      if (linkedUserId) {
        const user = await this.getUser(linkedUserId);
        if (user) users.push(user);
      } else {
        // フォールバック: 旧 user_id フィールド
        const user = await this.getUserByLarkId(String(up.fields.user_id ?? ''));
        if (user) users.push(user);
      }
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
  private async getAllUserApprovalRoles(): Promise<LarkBaseRecord[]> {
    return cached('userApprovalRoles:all', async () => {
      return this.client.getAllRecords(TABLES.userApprovalRoles);
    }, 120); // 2分キャッシュ
  }

  async getUserApprovalRoles(userId: string): Promise<UserApprovalRole[]> {
    const records = await this.getAllUserApprovalRoles();

    // user_link（リンクフィールド）または user_id（旧フィールド）でフィルタ
    return records
      .filter((r) => {
        const linkedUserId = this.getUserIdFromLink(r.fields.user_link);
        if (linkedUserId) {
          return linkedUserId === userId;
        }
        // フォールバック: 旧 user_id フィールド
        const user = this.getCachedUserById(userId);
        return r.fields.user_id === user?.larkUserId;
      })
      .map((r) => this.mapUserApprovalRole(r, userId));
  }

  async getUsersByApprovalRole(roleName: string): Promise<User[]> {
    const userRoles = await this.getAllUserApprovalRoles();
    const matching = userRoles.filter((ur) => ur.fields.approval_role_name === roleName);

    const users: User[] = [];
    for (const ur of matching) {
      // user_link（リンクフィールド）を優先
      const linkedUserId = this.getUserIdFromLink(ur.fields.user_link);
      if (linkedUserId) {
        const user = await this.getUser(linkedUserId);
        if (user) users.push(user);
      } else {
        // フォールバック: 旧 user_id フィールド
        const user = await this.getUserByLarkId(String(ur.fields.user_id ?? ''));
        if (user) users.push(user);
      }
    }
    return users;
  }

  async createUserApprovalRole(data: {
    userId: string;
    approvalRoleName: string;
    targetOrganizationCode?: string;
    validFrom?: Date;
    validTo?: Date;
  }): Promise<UserApprovalRole> {
    const record = await this.client.createRecord(TABLES.userApprovalRoles, {
      user_link: { link_record_ids: [data.userId] },
      approval_role_name: data.approvalRoleName,
      target_organization_code: data.targetOrganizationCode ?? '',
      valid_from: data.validFrom?.getTime() ?? Date.now(),
      valid_to: data.validTo?.getTime() ?? '',
    });
    this.clearCache('userApprovalRoles');
    return this.mapUserApprovalRole(record, data.userId);
  }

  async deleteUserApprovalRole(id: string): Promise<void> {
    await this.client.deleteRecord(TABLES.userApprovalRoles, id);
    this.clearCache('userApprovalRoles');
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
  private async getAllWorkflowRecords(): Promise<LarkBaseRecord[]> {
    return cached('workflows:records', async () => {
      return this.client.getAllRecords(TABLES.workflowDefinitions);
    }, 300); // 5分キャッシュ
  }

  async listWorkflows(category?: string): Promise<WorkflowDefinition[]> {
    const records = await this.getAllWorkflowRecords();
    let filtered = records;
    if (category) {
      filtered = records.filter((r) => r.fields.category === category);
    }
    return filtered.map((r) => this.mapWorkflowDefinition(r));
  }

  async getWorkflow(id: string): Promise<WorkflowDefinition | null> {
    const records = await this.getAllWorkflowRecords();
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

    let pdfSettings = null;
    try {
      const ps = record.fields.pdf_settings;
      if (ps && typeof ps === 'string') pdfSettings = JSON.parse(ps);
    } catch { /* ignore */ }

    let notificationSettings = null;
    try {
      const ns = record.fields.notification_settings;
      if (ns && typeof ns === 'string') notificationSettings = JSON.parse(ns);
    } catch { /* ignore */ }

    let viewingAllowedUsers: string[] = [];
    try {
      const vau = record.fields.viewing_allowed_users;
      if (vau && typeof vau === 'string') viewingAllowedUsers = JSON.parse(vau);
      else if (Array.isArray(vau)) viewingAllowedUsers = vau as string[];
    } catch { /* ignore */ }

    return {
      id: record.record_id!,
      name: String(record.fields.name ?? ''),
      description: String(record.fields.description ?? ''),
      category,
      formSchema,
      isActive: Boolean(record.fields.is_active),
      // Phase 1 拡張
      numberFormat: String(record.fields.number_format ?? '') || null,
      nextNumber: Number(record.fields.next_number ?? 1),
      allowWithdrawal: Boolean(record.fields.allow_withdrawal),
      allowPullUp: Boolean(record.fields.allow_pull_up),
      allowReuse: Boolean(record.fields.allow_reuse),
      // Phase 4 拡張
      viewingRestriction: (String(record.fields.viewing_restriction ?? 'all') || 'all') as WorkflowDefinition['viewingRestriction'],
      viewingAllowedUsers,
      allowProxyViewing: Boolean(record.fields.allow_proxy_viewing),
      // Phase 5 拡張
      pdfSettings,
      notificationSettings,
      // NI Collabo 拡張
      subjectAutoInputMode: (String(record.fields.subject_auto_input_mode ?? 'none') || 'none') as WorkflowDefinition['subjectAutoInputMode'],
      subjectTemplate: String(record.fields.subject_template ?? '') || null,
      allowRouteChange: Boolean(record.fields.allow_route_change),
      routeChangeRoles: (() => {
        try {
          const r = record.fields.route_change_roles;
          if (r && typeof r === 'string') return JSON.parse(r);
          if (Array.isArray(r)) return r;
        } catch { /* ignore */ }
        return [];
      })() as WorkflowDefinition['routeChangeRoles'],
      proxyProcessingAutoNotify: Boolean(record.fields.proxy_processing_auto_notify),
      proxyProcessingTimeoutDays: Number(record.fields.proxy_processing_timeout_days) || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // カテゴリ別のフォームスキーマ定義
  private getFormSchemaByCategory(category: string): WorkflowDefinition['formSchema'] {
    const schemas: Record<string, any> = {
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
  private async getAllApprovalStepRecords(): Promise<LarkBaseRecord[]> {
    return cached('approvalSteps:records', async () => {
      return this.client.getAllRecords(TABLES.approvalSteps);
    }, 300); // 5分キャッシュ
  }

  async getApprovalSteps(workflowId: string): Promise<ApprovalStep[]> {
    const records = await this.getAllApprovalStepRecords();
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
    let editableFields: string[] | null = null;
    try {
      const ef = record.fields.editable_fields;
      if (ef && typeof ef === 'string') editableFields = JSON.parse(ef);
      else if (Array.isArray(ef)) editableFields = ef as string[];
    } catch { /* ignore */ }

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
      // Phase 1 拡張
      stepRoleType: (String(record.fields.step_role_type ?? 'approver') || 'approver') as ApprovalStep['stepRoleType'],
      multiApproverMode: (String(record.fields.multi_approver_mode ?? 'single') || 'single') as ApprovalStep['multiApproverMode'],
      requiredApproverCount: record.fields.required_approver_count ? Number(record.fields.required_approver_count) : null,
      deadlineDays: record.fields.deadline_days ? Number(record.fields.deadline_days) : null,
      deadlineAutoAction: (String(record.fields.deadline_auto_action ?? 'none') || 'none') as ApprovalStep['deadlineAutoAction'],
      remandMode: (String(record.fields.remand_mode ?? 'require_reapproval') || 'require_reapproval') as ApprovalStep['remandMode'],
      allowSelfApproval: Boolean(record.fields.allow_self_approval),
      editableFields,
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
      proxyApplicantId: string | null;
      withdrawnAt: Date | null;
      routeMasterId: string | null;
      docNumber: string | null;
    }>
  ): Promise<Request> {
    const fields: Record<string, unknown> = {};
    if (data.title !== undefined) fields.title = data.title;
    if (data.content !== undefined) fields.content = JSON.stringify(data.content);
    if (data.status !== undefined) fields.status = data.status;
    if (data.currentStep !== undefined) fields.current_step = data.currentStep;
    if (data.submittedAt !== undefined) fields.submitted_at = data.submittedAt.getTime();
    if (data.completedAt !== undefined) fields.completed_at = data.completedAt.getTime();
    if (data.proxyApplicantId !== undefined) fields.proxy_applicant_id = data.proxyApplicantId ?? '';
    if (data.withdrawnAt !== undefined) fields.withdrawn_at = data.withdrawnAt?.getTime() ?? '';
    if (data.routeMasterId !== undefined) fields.route_master_id = data.routeMasterId ?? '';
    if (data.docNumber !== undefined) fields.doc_number = data.docNumber ?? '';

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
      // Phase 1 拡張
      proxyApplicantId: String(record.fields.proxy_applicant_id ?? '') || null,
      withdrawnAt: record.fields.withdrawn_at ? new Date(Number(record.fields.withdrawn_at)) : null,
      routeMasterId: String(record.fields.route_master_id ?? '') || null,
      docNumber: String(record.fields.doc_number ?? '') || null,
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
    action: string;
    comment?: string;
    skipReason?: string;
    proxyApproverId?: string;
    editedFields?: Record<string, unknown>;
  }): Promise<ApprovalHistory> {
    const record = await this.client.createRecord(TABLES.approvalHistory, {
      request_id: data.requestId,
      step_order: data.stepOrder,
      approver_id: data.approverId,
      action: data.action,
      comment: data.comment ?? '',
      skip_reason: data.skipReason ?? '',
      proxy_approver_id: data.proxyApproverId ?? '',
      edited_fields_json: data.editedFields ? JSON.stringify(data.editedFields) : '',
    });
    return this.mapApprovalHistory(record);
  }

  private mapApprovalHistory(record: LarkBaseRecord): ApprovalHistory {
    let editedFields: Record<string, unknown> | null = null;
    try {
      const ef = record.fields.edited_fields_json;
      if (ef && typeof ef === 'string') editedFields = JSON.parse(ef);
    } catch { /* ignore */ }

    return {
      id: record.record_id!,
      requestId: String(record.fields.request_id ?? ''),
      stepOrder: Number(record.fields.step_order ?? 0),
      approverId: String(record.fields.approver_id ?? '') || null,
      action: String(record.fields.action ?? 'approve') as ApprovalHistory['action'],
      comment: String(record.fields.comment ?? '') || null,
      skipReason: (String(record.fields.skip_reason ?? '') || null) as ApprovalHistory['skipReason'],
      // Phase 1 拡張
      proxyApproverId: String(record.fields.proxy_approver_id ?? '') || null,
      editedFields,
      // NI Collabo: 条件付き承認
      conditionalApproveTargetSteps: (() => {
        try {
          const cats = record.fields.conditional_approve_target_steps;
          if (cats && typeof cats === 'string') return JSON.parse(cats);
          if (Array.isArray(cats)) return cats.map(Number);
        } catch { /* ignore */ }
        return null;
      })(),
      createdAt: new Date(),
    };
  }

  // ==================== ステップ承認状況（複数承認者） ====================
  async getStepApprovalStatuses(requestId: string, stepOrder?: number): Promise<StepApprovalStatus[]> {
    if (!TABLES.stepApprovalStatuses) return [];
    const records = await this.client.getAllRecords(TABLES.stepApprovalStatuses);
    return records
      .filter((r) => {
        if (r.fields.request_id !== requestId) return false;
        if (stepOrder !== undefined && Number(r.fields.step_order) !== stepOrder) return false;
        return true;
      })
      .map((r) => this.mapStepApprovalStatus(r));
  }

  async createStepApprovalStatus(data: {
    requestId: string;
    stepOrder: number;
    approverId: string;
    status?: string;
    comment?: string;
    proxyApproverId?: string;
  }): Promise<StepApprovalStatus> {
    const record = await this.client.createRecord(TABLES.stepApprovalStatuses, {
      request_id: data.requestId,
      step_order: data.stepOrder,
      approver_id: data.approverId,
      status: data.status ?? 'pending',
      comment: data.comment ?? '',
      proxy_approver_id: data.proxyApproverId ?? '',
    });
    return this.mapStepApprovalStatus(record);
  }

  async updateStepApprovalStatus(id: string, data: Partial<{
    status: string;
    comment: string;
    processedAt: Date;
    proxyApproverId: string;
  }>): Promise<StepApprovalStatus> {
    const fields: Record<string, unknown> = {};
    if (data.status !== undefined) fields.status = data.status;
    if (data.comment !== undefined) fields.comment = data.comment;
    if (data.processedAt !== undefined) fields.processed_at = data.processedAt.getTime();
    if (data.proxyApproverId !== undefined) fields.proxy_approver_id = data.proxyApproverId;

    const record = await this.client.updateRecord(TABLES.stepApprovalStatuses, id, fields);
    return this.mapStepApprovalStatus(record);
  }

  private mapStepApprovalStatus(record: LarkBaseRecord): StepApprovalStatus {
    return {
      id: record.record_id!,
      requestId: String(record.fields.request_id ?? ''),
      stepOrder: Number(record.fields.step_order ?? 0),
      approverId: String(record.fields.approver_id ?? ''),
      status: (String(record.fields.status ?? 'pending') || 'pending') as StepApprovalStatus['status'],
      comment: String(record.fields.comment ?? '') || null,
      processedAt: record.fields.processed_at ? new Date(Number(record.fields.processed_at)) : null,
      proxyApproverId: String(record.fields.proxy_approver_id ?? '') || null,
    };
  }

  // ==================== 経路マスタ ====================

  async getRouteMasters(workflowId?: string): Promise<RouteMaster[]> {
    const filter = workflowId
      ? `CurrentValue.[workflow_id] = "${workflowId}"`
      : undefined;
    const records = await this.client.getAllRecords(TABLES.routeMasters, filter);
    return records.map(r => this.mapRouteMaster(r));
  }

  async getRouteMaster(id: string): Promise<RouteMaster | null> {
    const masters = await this.getRouteMasters();
    return masters.find(m => m.id === id) || null;
  }

  async getRouteMasterWithSteps(id: string): Promise<RouteMasterWithSteps | null> {
    const master = await this.getRouteMaster(id);
    if (!master) return null;
    const steps = await this.getRouteSteps(id);
    return { ...master, steps: steps.sort((a, b) => a.stepOrder - b.stepOrder) };
  }

  async createRouteMaster(data: Omit<RouteMaster, 'id' | 'createdAt' | 'updatedAt'>): Promise<RouteMaster> {
    const record = await this.client.createRecord(TABLES.routeMasters, {
      name: data.name,
      description: data.description,
      workflow_id: data.workflowId,
      route_type: data.routeType,
      priority: data.priority,
      target_position_id: data.targetPositionId,
      target_department_id: data.targetDepartmentId,
      target_user_id: data.targetUserId,
      is_standard: data.isStandard,
      is_active: data.isActive,
      conditions: data.conditions ? JSON.stringify(data.conditions) : null,
    });
    return this.mapRouteMaster(record);
  }

  async updateRouteMaster(id: string, data: Partial<Omit<RouteMaster, 'id' | 'createdAt' | 'updatedAt'>>): Promise<RouteMaster> {
    const fields: Record<string, unknown> = {};
    if (data.name !== undefined) fields.name = data.name;
    if (data.description !== undefined) fields.description = data.description;
    if (data.routeType !== undefined) fields.route_type = data.routeType;
    if (data.priority !== undefined) fields.priority = data.priority;
    if (data.targetPositionId !== undefined) fields.target_position_id = data.targetPositionId;
    if (data.targetDepartmentId !== undefined) fields.target_department_id = data.targetDepartmentId;
    if (data.targetUserId !== undefined) fields.target_user_id = data.targetUserId;
    if (data.isStandard !== undefined) fields.is_standard = data.isStandard;
    if (data.isActive !== undefined) fields.is_active = data.isActive;
    if (data.conditions !== undefined) fields.conditions = data.conditions ? JSON.stringify(data.conditions) : null;
    const record = await this.client.updateRecord(TABLES.routeMasters, id, fields);
    return this.mapRouteMaster(record);
  }

  async deleteRouteMaster(id: string): Promise<void> {
    // ステップも連鎖削除
    const steps = await this.getRouteSteps(id);
    for (const step of steps) {
      await this.client.deleteRecord(TABLES.routeSteps, step.id);
    }
    await this.client.deleteRecord(TABLES.routeMasters, id);
  }

  private mapRouteMaster(record: LarkBaseRecord): RouteMaster {
    let conditions = null;
    try {
      const raw = record.fields.conditions;
      if (raw && typeof raw === 'string') conditions = JSON.parse(raw);
    } catch { /* ignore */ }

    return {
      id: record.record_id!,
      name: String(record.fields.name ?? ''),
      description: String(record.fields.description ?? ''),
      workflowId: String(record.fields.workflow_id ?? ''),
      routeType: (String(record.fields.route_type ?? 'basic') as RouteMaster['routeType']),
      priority: Number(record.fields.priority ?? 1),
      targetPositionId: record.fields.target_position_id ? String(record.fields.target_position_id) : null,
      targetDepartmentId: record.fields.target_department_id ? String(record.fields.target_department_id) : null,
      targetUserId: record.fields.target_user_id ? String(record.fields.target_user_id) : null,
      isStandard: Boolean(record.fields.is_standard),
      isActive: Boolean(record.fields.is_active),
      conditions,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // ==================== 経路ステップ ====================

  async getAllRouteSteps(): Promise<RouteStep[]> {
    const records = await this.client.getAllRecords(TABLES.routeSteps);
    return records.map(r => this.mapRouteStep(r));
  }

  async getRouteSteps(routeMasterId: string): Promise<RouteStep[]> {
    const filter = `CurrentValue.[route_master_id] = "${routeMasterId}"`;
    const records = await this.client.getAllRecords(TABLES.routeSteps, filter);
    return records.map(r => this.mapRouteStep(r)).sort((a, b) => a.stepOrder - b.stepOrder);
  }

  async createRouteStep(data: Omit<RouteStep, 'id' | 'createdAt' | 'updatedAt'>): Promise<RouteStep> {
    let editableFields = null;
    try { if (data.editableFields) editableFields = JSON.stringify(data.editableFields); } catch { /* ignore */ }
    let conditions = null;
    try { if (data.conditions) conditions = JSON.stringify(data.conditions); } catch { /* ignore */ }

    const record = await this.client.createRecord(TABLES.routeSteps, {
      route_master_id: data.routeMasterId,
      step_order: data.stepOrder,
      step_type: data.stepType,
      position_id: data.positionId,
      approval_role_id: data.approvalRoleId,
      specific_user_id: data.specificUserId,
      label: data.label,
      is_required: data.isRequired,
      skip_if_same_person: data.skipIfSamePerson,
      skip_if_vacant: data.skipIfVacant,
      conditions,
      step_role_type: data.stepRoleType,
      multi_approver_mode: data.multiApproverMode,
      required_approver_count: data.requiredApproverCount,
      deadline_days: data.deadlineDays,
      deadline_auto_action: data.deadlineAutoAction,
      remand_mode: data.remandMode,
      allow_self_approval: data.allowSelfApproval,
      editable_fields: editableFields,
    });
    return this.mapRouteStep(record);
  }

  async updateRouteStep(id: string, data: Partial<Omit<RouteStep, 'id' | 'createdAt' | 'updatedAt'>>): Promise<RouteStep> {
    const fields: Record<string, unknown> = {};
    if (data.stepOrder !== undefined) fields.step_order = data.stepOrder;
    if (data.stepType !== undefined) fields.step_type = data.stepType;
    if (data.positionId !== undefined) fields.position_id = data.positionId;
    if (data.approvalRoleId !== undefined) fields.approval_role_id = data.approvalRoleId;
    if (data.specificUserId !== undefined) fields.specific_user_id = data.specificUserId;
    if (data.label !== undefined) fields.label = data.label;
    if (data.isRequired !== undefined) fields.is_required = data.isRequired;
    if (data.skipIfSamePerson !== undefined) fields.skip_if_same_person = data.skipIfSamePerson;
    if (data.skipIfVacant !== undefined) fields.skip_if_vacant = data.skipIfVacant;
    if (data.conditions !== undefined) fields.conditions = data.conditions ? JSON.stringify(data.conditions) : null;
    if (data.stepRoleType !== undefined) fields.step_role_type = data.stepRoleType;
    if (data.multiApproverMode !== undefined) fields.multi_approver_mode = data.multiApproverMode;
    if (data.requiredApproverCount !== undefined) fields.required_approver_count = data.requiredApproverCount;
    if (data.deadlineDays !== undefined) fields.deadline_days = data.deadlineDays;
    if (data.deadlineAutoAction !== undefined) fields.deadline_auto_action = data.deadlineAutoAction;
    if (data.remandMode !== undefined) fields.remand_mode = data.remandMode;
    if (data.allowSelfApproval !== undefined) fields.allow_self_approval = data.allowSelfApproval;
    if (data.editableFields !== undefined) fields.editable_fields = data.editableFields ? JSON.stringify(data.editableFields) : null;
    const record = await this.client.updateRecord(TABLES.routeSteps, id, fields);
    return this.mapRouteStep(record);
  }

  async deleteRouteStep(id: string): Promise<void> {
    await this.client.deleteRecord(TABLES.routeSteps, id);
  }

  private mapRouteStep(record: LarkBaseRecord): RouteStep {
    let conditions = null;
    try {
      const raw = record.fields.conditions;
      if (raw && typeof raw === 'string') conditions = JSON.parse(raw);
    } catch { /* ignore */ }

    let editableFields = null;
    try {
      const raw = record.fields.editable_fields;
      if (raw && typeof raw === 'string') editableFields = JSON.parse(raw);
    } catch { /* ignore */ }

    return {
      id: record.record_id!,
      routeMasterId: String(record.fields.route_master_id ?? ''),
      stepOrder: Number(record.fields.step_order ?? 0),
      stepType: String(record.fields.step_type ?? 'position') as RouteStep['stepType'],
      positionId: record.fields.position_id ? String(record.fields.position_id) : null,
      approvalRoleId: record.fields.approval_role_id ? String(record.fields.approval_role_id) : null,
      specificUserId: record.fields.specific_user_id ? String(record.fields.specific_user_id) : null,
      label: record.fields.label ? String(record.fields.label) : null,
      isRequired: Boolean(record.fields.is_required),
      skipIfSamePerson: Boolean(record.fields.skip_if_same_person),
      skipIfVacant: Boolean(record.fields.skip_if_vacant),
      conditions,
      stepRoleType: (String(record.fields.step_role_type ?? 'approver') as RouteStep['stepRoleType']),
      multiApproverMode: (String(record.fields.multi_approver_mode ?? 'single') as RouteStep['multiApproverMode']),
      requiredApproverCount: record.fields.required_approver_count ? Number(record.fields.required_approver_count) : null,
      deadlineDays: record.fields.deadline_days ? Number(record.fields.deadline_days) : null,
      deadlineAutoAction: (String(record.fields.deadline_auto_action ?? 'none') as RouteStep['deadlineAutoAction']),
      remandMode: (String(record.fields.remand_mode ?? 'require_reapproval') as RouteStep['remandMode']),
      allowSelfApproval: Boolean(record.fields.allow_self_approval),
      editableFields,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // ==================== 代理設定 ====================

  async getProxySettings(): Promise<ProxySetting[]> {
    const records = await this.client.getAllRecords(TABLES.proxySettings);
    return records.map(r => this.mapProxySetting(r));
  }

  async createProxySetting(data: Omit<ProxySetting, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProxySetting> {
    const record = await this.client.createRecord(TABLES.proxySettings, {
      principal_user_id: data.principalUserId,
      proxy_user_id: data.proxyUserId,
      proxy_type: data.proxyType,
      target_roles: JSON.stringify(data.targetRoles),
      valid_from: data.validFrom.toISOString(),
      valid_to: data.validTo ? data.validTo.toISOString() : null,
      is_active: data.isActive,
    });
    return this.mapProxySetting(record);
  }

  async updateProxySetting(id: string, data: Partial<Omit<ProxySetting, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ProxySetting> {
    const fields: Record<string, unknown> = {};
    if (data.principalUserId !== undefined) fields.principal_user_id = data.principalUserId;
    if (data.proxyUserId !== undefined) fields.proxy_user_id = data.proxyUserId;
    if (data.proxyType !== undefined) fields.proxy_type = data.proxyType;
    if (data.targetRoles !== undefined) fields.target_roles = JSON.stringify(data.targetRoles);
    if (data.validFrom !== undefined) fields.valid_from = data.validFrom.toISOString();
    if (data.validTo !== undefined) fields.valid_to = data.validTo ? data.validTo.toISOString() : null;
    if (data.isActive !== undefined) fields.is_active = data.isActive;
    const record = await this.client.updateRecord(TABLES.proxySettings, id, fields);
    return this.mapProxySetting(record);
  }

  async deleteProxySetting(id: string): Promise<void> {
    await this.client.deleteRecord(TABLES.proxySettings, id);
  }

  private mapProxySetting(record: LarkBaseRecord): ProxySetting {
    let targetRoles: string[] = [];
    try {
      const raw = record.fields.target_roles;
      if (raw && typeof raw === 'string') targetRoles = JSON.parse(raw);
    } catch { /* ignore */ }

    return {
      id: record.record_id!,
      principalUserId: String(record.fields.principal_user_id ?? ''),
      proxyUserId: String(record.fields.proxy_user_id ?? ''),
      proxyType: String(record.fields.proxy_type ?? 'application') as ProxySetting['proxyType'],
      targetRoles,
      validFrom: new Date(String(record.fields.valid_from ?? '')),
      validTo: record.fields.valid_to ? new Date(String(record.fields.valid_to)) : null,
      isActive: Boolean(record.fields.is_active),
      createdAt: new Date(),
      updatedAt: new Date(),
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
