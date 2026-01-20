import 'dotenv/config';
import { initLarkClient, LarkBaseClient } from '../lark/client.js';
import { ApprovalService, type DataStore } from '../services/approval.service.js';
import type {
  User,
  UserPosition,
  UserApprovalRole,
  Organization,
  Position,
  WorkflowWithSteps,
  ApprovalHistory,
  Request,
  ApprovalStep,
} from '../models/index.js';

const LARK_APP_ID = process.env.LARK_APP_ID ?? '';
const LARK_APP_SECRET = process.env.LARK_APP_SECRET ?? '';
const LARK_BASE_APP_TOKEN = process.env.LARK_BASE_APP_TOKEN ?? '';

// テーブルID
const TABLES = {
  organizations: 'tblCnyU5rDlwsFCd',
  positions: 'tblvNSExDwSQLTl4',
  approvalRoles: 'tblexuWyCZJQVsUt',
  users: 'tblKjUDl9ysBlZot',
  userPositions: 'tblGSAYD0p99ZpEf',
  userApprovalRoles: 'tblbHimZpnz1tKzB',
  workflowDefinitions: 'tbloV9BwBTySxhzp',
  approvalSteps: 'tbls8HxUObebzsFl',
};

// Lark BaseからデータをロードするDataStore実装
class LarkBaseDataStore implements DataStore {
  private baseClient: LarkBaseClient;
  private cache: {
    users: Map<string, User>;
    usersByLarkId: Map<string, User>;
    organizations: Map<string, Organization>;
    positions: Map<string, Position>;
    positionsByName: Map<string, Position>;
    userPositions: UserPosition[];
    userApprovalRoles: UserApprovalRole[];
    workflows: Map<string, WorkflowWithSteps>;
    approvalRoles: Map<string, { id: string; name: string }>;
  } = {
    users: new Map(),
    usersByLarkId: new Map(),
    organizations: new Map(),
    positions: new Map(),
    positionsByName: new Map(),
    userPositions: [],
    userApprovalRoles: [],
    workflows: new Map(),
    approvalRoles: new Map(),
  };

  constructor(baseClient: LarkBaseClient) {
    this.baseClient = baseClient;
  }

  async loadData(): Promise<void> {
    console.log('\n📥 Lark Baseからデータをロード中...');

    // 組織マスタ
    const orgs = await this.baseClient.getAllRecords(TABLES.organizations);
    for (const org of orgs) {
      const o: Organization = {
        id: org.record_id!,
        code: String(org.fields.code ?? ''),
        name: String(org.fields.name ?? ''),
        level: String(org.fields.level ?? 'section') as Organization['level'],
        parentId: String(org.fields.parent_code ?? '') || null,
        isActive: Boolean(org.fields.is_active),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.cache.organizations.set(o.code, o);
    }
    console.log(`   ✅ 組織: ${this.cache.organizations.size}件`);

    // 役職マスタ
    const positions = await this.baseClient.getAllRecords(TABLES.positions);
    for (const pos of positions) {
      const p: Position = {
        id: pos.record_id!,
        name: String(pos.fields.name ?? ''),
        level: Number(pos.fields.level ?? 5),
        isActive: Boolean(pos.fields.is_active),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.cache.positions.set(p.id, p);
      this.cache.positionsByName.set(p.name, p);
    }
    console.log(`   ✅ 役職: ${this.cache.positions.size}件`);

    // 承認ロールマスタ
    const roles = await this.baseClient.getAllRecords(TABLES.approvalRoles);
    for (const role of roles) {
      this.cache.approvalRoles.set(String(role.fields.name ?? ''), {
        id: role.record_id!,
        name: String(role.fields.name ?? ''),
      });
    }
    console.log(`   ✅ 承認ロール: ${this.cache.approvalRoles.size}件`);

    // ユーザー
    const users = await this.baseClient.getAllRecords(TABLES.users);
    for (const user of users) {
      const u: User = {
        id: user.record_id!,
        larkUserId: String(user.fields.lark_user_id ?? ''),
        name: String(user.fields.name ?? ''),
        email: String(user.fields.email ?? ''),
        isActive: Boolean(user.fields.is_active),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.cache.users.set(u.id, u);
      this.cache.usersByLarkId.set(u.larkUserId, u);
    }
    console.log(`   ✅ ユーザー: ${this.cache.users.size}件`);

    // ユーザー役職
    const userPositions = await this.baseClient.getAllRecords(TABLES.userPositions);
    for (const up of userPositions) {
      // テーブルのフィールド名は user_id (lark_user_idの値が入っている)
      const larkUserId = String(up.fields.user_id ?? '');
      const user = this.cache.usersByLarkId.get(larkUserId);
      if (user) {
        this.cache.userPositions.push({
          id: up.record_id!,
          userId: user.id,
          organizationId: String(up.fields.organization_code ?? ''),
          positionId: String(up.fields.position_name ?? ''),
          isPrimary: Boolean(up.fields.is_primary),
          validFrom: new Date(String(up.fields.valid_from ?? '')),
          validTo: up.fields.valid_to ? new Date(String(up.fields.valid_to)) : null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }
    console.log(`   ✅ ユーザー役職: ${this.cache.userPositions.length}件`);

    // ユーザー承認ロール
    const userRoles = await this.baseClient.getAllRecords(TABLES.userApprovalRoles);
    for (const ur of userRoles) {
      // テーブルのフィールド名は user_id (lark_user_idの値が入っている)
      const larkUserId = String(ur.fields.user_id ?? '');
      const user = this.cache.usersByLarkId.get(larkUserId);
      const roleName = String(ur.fields.approval_role_name ?? '');
      const role = this.cache.approvalRoles.get(roleName);
      if (user && role) {
        this.cache.userApprovalRoles.push({
          id: ur.record_id!,
          userId: user.id,
          approvalRoleId: role.id,
          targetOrganizationId: String(ur.fields.target_organization_code ?? '') || null,
          validFrom: new Date(String(ur.fields.valid_from ?? '')),
          validTo: ur.fields.valid_to ? new Date(String(ur.fields.valid_to)) : null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }
    console.log(`   ✅ ユーザー承認ロール: ${this.cache.userApprovalRoles.length}件`);

    // ワークフロー定義
    const workflows = await this.baseClient.getAllRecords(TABLES.workflowDefinitions);
    for (const wf of workflows) {
      const workflow: WorkflowWithSteps = {
        id: wf.record_id!,
        name: String(wf.fields.name ?? ''),
        description: String(wf.fields.description ?? ''),
        category: String(wf.fields.category ?? ''),
        isActive: Boolean(wf.fields.is_active),
        createdAt: new Date(),
        updatedAt: new Date(),
        steps: [],
      };
      this.cache.workflows.set(workflow.name, workflow);
    }

    // 承認ステップ
    const steps = await this.baseClient.getAllRecords(TABLES.approvalSteps);
    console.log(`   📋 承認ステップ: ${steps.length}件ロード`);
    for (const step of steps) {
      // workflow_id フィールドを使用（workflow_nameではなく）
      const workflowId = String(step.fields.workflow_id ?? '');
      // workflowIdでワークフローを検索
      let workflow: WorkflowWithSteps | undefined;
      for (const wf of this.cache.workflows.values()) {
        if (wf.id === workflowId) {
          workflow = wf;
          break;
        }
      }
      if (workflow) {
        const positionName = String(step.fields.position_name ?? '');
        const roleName = String(step.fields.approval_role_name ?? '');
        const position = this.cache.positionsByName.get(positionName);
        const role = this.cache.approvalRoles.get(roleName);

        const s: ApprovalStep = {
          id: step.record_id!,
          workflowId: workflow.id,
          stepOrder: Number(step.fields.step_order ?? 0),
          stepType: String(step.fields.step_type ?? 'position') as ApprovalStep['stepType'],
          positionId: position?.id ?? null,
          approvalRoleId: role?.id ?? null,
          specificUserId: String(step.fields.specific_user_id ?? '') || null,
          label: String(step.fields.label ?? ''),
          isRequired: Boolean(step.fields.is_required),
          skipIfSamePerson: Boolean(step.fields.skip_if_same_person),
          skipIfVacant: Boolean(step.fields.skip_if_vacant),
          conditions: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        workflow.steps.push(s);
      }
    }
    console.log(`   ✅ ワークフロー: ${this.cache.workflows.size}件`);
    // ワークフローのステップ数を表示
    for (const wf of this.cache.workflows.values()) {
      console.log(`      📋 ${wf.name}: ${wf.steps.length}ステップ`);
    }
  }

  async getUser(id: string): Promise<User | null> {
    return this.cache.users.get(id) ?? null;
  }

  async getUserByLarkId(larkUserId: string): Promise<User | null> {
    return this.cache.usersByLarkId.get(larkUserId) ?? null;
  }

  async getUserPositions(userId: string): Promise<UserPosition[]> {
    return this.cache.userPositions.filter((up) => up.userId === userId);
  }

  async getUserApprovalRoles(userId: string): Promise<UserApprovalRole[]> {
    return this.cache.userApprovalRoles.filter((ur) => ur.userId === userId);
  }

  async getOrganization(id: string): Promise<Organization | null> {
    // まずcodeで検索
    let org = this.cache.organizations.get(id);
    if (org) return org;

    // 見つからない場合、record_idで検索
    for (const o of this.cache.organizations.values()) {
      if (o.id === id) {
        return o;
      }
    }
    return null;
  }

  async getPosition(id: string): Promise<Position | null> {
    return this.cache.positions.get(id) ?? this.cache.positionsByName.get(id) ?? null;
  }

  async getUsersByOrganizationAndPosition(
    organizationId: string,
    positionId: string
  ): Promise<User[]> {
    const position = await this.getPosition(positionId);
    const posName = position?.name ?? positionId;

    // organizationIdはrecord_idまたはorganization_codeのどちらかの可能性がある
    // まずorganization_codeで検索
    let userIds = this.cache.userPositions
      .filter((up) => up.organizationId === organizationId && up.positionId === posName)
      .map((up) => up.userId);

    // 見つからない場合、organizationIdをrecord_idとして扱い、対応するcodeを取得
    if (userIds.length === 0) {
      // record_idからorganizationを検索
      let orgCode: string | undefined;
      for (const org of this.cache.organizations.values()) {
        if (org.id === organizationId) {
          orgCode = org.code;
          break;
        }
      }
      if (orgCode) {
        userIds = this.cache.userPositions
          .filter((up) => up.organizationId === orgCode && up.positionId === posName)
          .map((up) => up.userId);
      }
    }

    return userIds.map((id) => this.cache.users.get(id)).filter((u): u is User => u !== undefined);
  }

  async getUsersByApprovalRole(
    approvalRoleId: string,
    targetOrganizationId?: string | null
  ): Promise<User[]> {
    const userIds = this.cache.userApprovalRoles
      .filter((ur) => {
        if (ur.approvalRoleId !== approvalRoleId) return false;
        if (targetOrganizationId && ur.targetOrganizationId) {
          return ur.targetOrganizationId === targetOrganizationId;
        }
        return !ur.targetOrganizationId; // 組織指定なしのグローバルロール
      })
      .map((ur) => ur.userId);

    return userIds.map((id) => this.cache.users.get(id)).filter((u): u is User => u !== undefined);
  }

  async getWorkflowWithSteps(workflowId: string): Promise<WorkflowWithSteps | null> {
    for (const wf of this.cache.workflows.values()) {
      if (wf.id === workflowId || wf.name === workflowId) {
        return wf;
      }
    }
    return null;
  }

  async getApprovalHistory(): Promise<ApprovalHistory[]> {
    return []; // テストでは履歴なし
  }

  // ヘルパーメソッド
  getOrganizationByCode(code: string): Organization | undefined {
    return this.cache.organizations.get(code);
  }

  getWorkflowByName(name: string): WorkflowWithSteps | undefined {
    return this.cache.workflows.get(name);
  }
}

async function testWorkflow() {
  console.log('='.repeat(60));
  console.log('🧪 ワークフロー承認ルート テスト');
  console.log('='.repeat(60));

  // 初期化
  initLarkClient({
    appId: LARK_APP_ID,
    appSecret: LARK_APP_SECRET,
  });

  const baseClient = new LarkBaseClient({ appToken: LARK_BASE_APP_TOKEN });
  const dataStore = new LarkBaseDataStore(baseClient);
  await dataStore.loadData();

  const approvalService = new ApprovalService(dataStore);

  // テストシナリオ1: 高橋（営業1課 一般）が経費精算（10万円未満）を申請
  console.log('\n' + '='.repeat(60));
  console.log('📋 テストシナリオ1: 通常の承認ルート');
  console.log('   申請者: 高橋三郎（営業1課 一般）');
  console.log('   ワークフロー: 経費精算（10万円未満）');
  console.log('='.repeat(60));

  const applicant1 = await dataStore.getUserByLarkId('user_sales_staff');
  const org1 = dataStore.getOrganizationByCode('SALES1-1');
  const workflow1 = dataStore.getWorkflowByName('経費精算（10万円未満）');

  if (applicant1 && org1 && workflow1) {
    const request1: Request = {
      id: 'test-request-1',
      workflowId: workflow1.id,
      applicantId: applicant1.id,
      applicantOrganizationId: org1.id,
      title: 'テスト経費精算',
      content: { amount: 50000 },
      status: 'pending',
      currentStep: 1,
      submittedAt: new Date(),
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const route1 = await approvalService.resolveApprovalRoute({
      request: request1,
      applicant: applicant1,
      applicantOrganization: org1,
      workflow: workflow1,
      currentDate: new Date(),
    });

    console.log('\n📍 承認ルート:');
    for (const step of route1) {
      const statusIcon =
        step.status === 'pending'
          ? '⏳'
          : step.status === 'skipped'
            ? '⏭️'
            : step.status === 'waiting'
              ? '⏸️'
              : '✅';
      const approverName = step.approver?.name ?? '（なし）';
      const skipInfo = step.skipReason ? ` [${step.skipReason}]` : '';
      console.log(`   ${statusIcon} ステップ${step.stepOrder}: ${step.label}`);
      console.log(`      承認者: ${approverName}${skipInfo}`);
    }
  }

  // テストシナリオ2: 佐藤（営業1課 課長）が経費精算（10万円未満）を申請
  // → 自分が課長なので課長ステップはスキップされるべき
  console.log('\n' + '='.repeat(60));
  console.log('📋 テストシナリオ2: 同一人物スキップ');
  console.log('   申請者: 佐藤花子（営業1課 課長）');
  console.log('   ワークフロー: 経費精算（10万円未満）');
  console.log('   期待: 課長承認がスキップされる');
  console.log('='.repeat(60));

  const applicant2 = await dataStore.getUserByLarkId('user_sales_manager');
  if (applicant2 && org1 && workflow1) {
    const request2: Request = {
      id: 'test-request-2',
      workflowId: workflow1.id,
      applicantId: applicant2.id,
      applicantOrganizationId: org1.id,
      title: 'テスト経費精算（課長申請）',
      content: { amount: 30000 },
      status: 'pending',
      currentStep: 1,
      submittedAt: new Date(),
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const route2 = await approvalService.resolveApprovalRoute({
      request: request2,
      applicant: applicant2,
      applicantOrganization: org1,
      workflow: workflow1,
      currentDate: new Date(),
    });

    console.log('\n📍 承認ルート:');
    for (const step of route2) {
      const statusIcon =
        step.status === 'pending'
          ? '⏳'
          : step.status === 'skipped'
            ? '⏭️'
            : step.status === 'waiting'
              ? '⏸️'
              : '✅';
      const approverName = step.approver?.name ?? '（なし）';
      const skipInfo = step.skipReason ? ` [スキップ理由: ${step.skipReason}]` : '';
      console.log(`   ${statusIcon} ステップ${step.stepOrder}: ${step.label}`);
      console.log(`      承認者: ${approverName}${skipInfo}`);
    }
  }

  // テストシナリオ3: 鈴木（営業本部長 兼 営業1部 部長）が経費精算を申請
  // → 課長がいない、部長も自分なのでスキップが連続するべき
  console.log('\n' + '='.repeat(60));
  console.log('📋 テストシナリオ3: 兼務によるスキップ確認');
  console.log('   申請者: 鈴木一郎（営業本部長 兼 営業1部部長）');
  console.log('   ワークフロー: 経費精算（10万円未満）');
  console.log('   期待: 課長空席スキップ + 部長同一人物スキップ');
  console.log('='.repeat(60));

  const applicant3 = await dataStore.getUserByLarkId('user_sales_director');
  const org3 = dataStore.getOrganizationByCode('SALES1'); // 営業1部から申請
  if (applicant3 && org3 && workflow1) {
    const request3: Request = {
      id: 'test-request-3',
      workflowId: workflow1.id,
      applicantId: applicant3.id,
      applicantOrganizationId: org3.id,
      title: 'テスト経費精算（部長申請）',
      content: { amount: 80000 },
      status: 'pending',
      currentStep: 1,
      submittedAt: new Date(),
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const route3 = await approvalService.resolveApprovalRoute({
      request: request3,
      applicant: applicant3,
      applicantOrganization: org3,
      workflow: workflow1,
      currentDate: new Date(),
    });

    console.log('\n📍 承認ルート:');
    for (const step of route3) {
      const statusIcon =
        step.status === 'pending'
          ? '⏳'
          : step.status === 'skipped'
            ? '⏭️'
            : step.status === 'waiting'
              ? '⏸️'
              : '✅';
      const approverName = step.approver?.name ?? '（なし）';
      const skipInfo = step.skipReason ? ` [スキップ理由: ${step.skipReason}]` : '';
      console.log(`   ${statusIcon} ステップ${step.stepOrder}: ${step.label}`);
      console.log(`      承認者: ${approverName}${skipInfo}`);
    }
  }

  // テストシナリオ4: 10万円以上の経費精算（取締役決裁付き）
  console.log('\n' + '='.repeat(60));
  console.log('📋 テストシナリオ4: 取締役決裁付きワークフロー');
  console.log('   申請者: 高橋三郎（営業1課 一般）');
  console.log('   ワークフロー: 経費精算（10万円以上）');
  console.log('='.repeat(60));

  const workflow2 = dataStore.getWorkflowByName('経費精算（10万円以上）');
  if (applicant1 && org1 && workflow2) {
    const request4: Request = {
      id: 'test-request-4',
      workflowId: workflow2.id,
      applicantId: applicant1.id,
      applicantOrganizationId: org1.id,
      title: 'テスト経費精算（高額）',
      content: { amount: 150000 },
      status: 'pending',
      currentStep: 1,
      submittedAt: new Date(),
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const route4 = await approvalService.resolveApprovalRoute({
      request: request4,
      applicant: applicant1,
      applicantOrganization: org1,
      workflow: workflow2,
      currentDate: new Date(),
    });

    console.log('\n📍 承認ルート:');
    for (const step of route4) {
      const statusIcon =
        step.status === 'pending'
          ? '⏳'
          : step.status === 'skipped'
            ? '⏭️'
            : step.status === 'waiting'
              ? '⏸️'
              : '✅';
      const approverName = step.approver?.name ?? '（なし）';
      const skipInfo = step.skipReason ? ` [スキップ理由: ${step.skipReason}]` : '';
      console.log(`   ${statusIcon} ステップ${step.stepOrder}: ${step.label}`);
      console.log(`      承認者: ${approverName}${skipInfo}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✨ テスト完了');
  console.log('='.repeat(60));
}

testWorkflow().catch(console.error);
