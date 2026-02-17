import { describe, it, expect, beforeEach } from 'vitest';
import { ApprovalService, type DataStore, type ApprovalContext } from '../services/approval.service.js';
import { ProxyService, type ProxyDataStore } from '../services/proxy.service.js';
import type {
  User,
  UserPosition,
  UserApprovalRole,
  Organization,
  Position,
  WorkflowDefinition,
  WorkflowWithSteps,
  ApprovalStep,
  Request,
  ApprovalHistory,
  ProxySetting,
} from '../models/index.js';

// Phase 1 追加フィールドのデフォルト値
const stepDefaults = {
  stepRoleType: 'approver' as const,
  multiApproverMode: 'single' as const,
  requiredApproverCount: null,
  deadlineDays: null,
  deadlineAutoAction: 'none' as const,
  remandMode: 'require_reapproval' as const,
  allowSelfApproval: false,
  editableFields: null,
};

const requestDefaults = {
  proxyApplicantId: null,
  withdrawnAt: null,
  routeMasterId: null,
  docNumber: null,
};

const workflowDefaults = {
  numberFormat: null,
  nextNumber: 1,
  allowWithdrawal: false,
  allowPullUp: false,
  allowReuse: false,
  viewingRestriction: 'all' as const,
  viewingAllowedUsers: [] as string[],
  allowProxyViewing: false,
  pdfSettings: null,
  notificationSettings: null,
  subjectAutoInputMode: 'none' as const,
  subjectTemplate: null,
  allowRouteChange: false,
  routeChangeRoles: [] as ('approver' | 'final_approver' | 'handler' | 'notifier')[],
  proxyProcessingAutoNotify: false,
  proxyProcessingTimeoutDays: null,
};

const historyDefaults = {
  proxyApproverId: null,
  editedFields: null,
  conditionalApproveTargetSteps: null,
};

// モックデータ
const mockOrganizations: Organization[] = [
  {
    id: 'org-company',
    name: '本社',
    code: 'CORP',
    level: 'company',
    parentId: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'org-sales',
    name: '営業部',
    code: 'SALES',
    level: 'department',
    parentId: 'org-company',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const mockPositions: Position[] = [
  { id: 'pos-president', name: '社長', level: 1, isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'pos-director', name: '部長', level: 3, isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'pos-manager', name: '課長', level: 4, isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'pos-staff', name: '一般', level: 5, isActive: true, createdAt: new Date(), updatedAt: new Date() },
];

const mockUsers: User[] = [
  { id: 'user-tanaka', larkUserId: 'ou_tanaka', name: '田中太郎', email: 'tanaka@example.com', role: 'user', isActive: true, sealImageUrl: null, createdAt: new Date(), updatedAt: new Date() },
  { id: 'user-suzuki', larkUserId: 'ou_suzuki', name: '鈴木一郎', email: 'suzuki@example.com', role: 'user', isActive: true, sealImageUrl: null, createdAt: new Date(), updatedAt: new Date() },
  { id: 'user-sato', larkUserId: 'ou_sato', name: '佐藤花子', email: 'sato@example.com', role: 'user', isActive: true, sealImageUrl: null, createdAt: new Date(), updatedAt: new Date() },
];

const mockUserPositions: UserPosition[] = [
  // 田中: 営業部 一般
  {
    id: 'up-1',
    userId: 'user-tanaka',
    organizationId: 'org-sales',
    positionId: 'pos-staff',
    isPrimary: true,
    validFrom: new Date('2024-01-01'),
    validTo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // 鈴木: 営業部 部長（課長を兼務）
  {
    id: 'up-2',
    userId: 'user-suzuki',
    organizationId: 'org-sales',
    positionId: 'pos-director',
    isPrimary: true,
    validFrom: new Date('2024-01-01'),
    validTo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'up-3',
    userId: 'user-suzuki',
    organizationId: 'org-sales',
    positionId: 'pos-manager',
    isPrimary: false,
    validFrom: new Date('2024-01-01'),
    validTo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// モックDataStore
function createMockDataStore(): DataStore {
  return {
    async getUser(id: string) {
      return mockUsers.find((u) => u.id === id) ?? null;
    },
    async getUserByLarkId(larkUserId: string) {
      return mockUsers.find((u) => u.larkUserId === larkUserId) ?? null;
    },
    async getUserPositions(userId: string, date?: Date) {
      return mockUserPositions.filter(
        (up) =>
          up.userId === userId &&
          up.validFrom <= (date ?? new Date()) &&
          (up.validTo === null || up.validTo >= (date ?? new Date()))
      );
    },
    async getUserApprovalRoles(userId: string, date?: Date) {
      return [];
    },
    async getOrganization(id: string) {
      return mockOrganizations.find((o) => o.id === id) ?? null;
    },
    async getPosition(id: string) {
      return mockPositions.find((p) => p.id === id) ?? null;
    },
    async getUsersByOrganizationAndPosition(
      organizationId: string,
      positionId: string,
      date?: Date
    ) {
      const userIds = mockUserPositions
        .filter(
          (up) =>
            up.organizationId === organizationId &&
            up.positionId === positionId &&
            up.validFrom <= (date ?? new Date()) &&
            (up.validTo === null || up.validTo >= (date ?? new Date()))
        )
        .map((up) => up.userId);

      return mockUsers.filter((u) => userIds.includes(u.id));
    },
    async getUsersByApprovalRole(
      approvalRoleId: string,
      targetOrganizationId?: string | null,
      date?: Date
    ) {
      return [];
    },
    async getWorkflowWithSteps(workflowId: string) {
      return null;
    },
    async getApprovalHistory(requestId: string) {
      return [];
    },
  };
}

describe('ApprovalService', () => {
  let service: ApprovalService;
  let dataStore: DataStore;

  beforeEach(() => {
    dataStore = createMockDataStore();
    service = new ApprovalService(dataStore);
  });

  describe('resolveApprovalRoute', () => {
    it('空席スキップ: 課長が不在の場合、部長にエスカレーション', async () => {
      const workflow: WorkflowWithSteps = {
        id: 'wf-1',
        name: 'テストワークフロー',
        description: '',
        category: 'テスト',
        isActive: true,
        formSchema: null,
        ...workflowDefaults,
        createdAt: new Date(),
        updatedAt: new Date(),
        steps: [
          {
            id: 'step-1',
            workflowId: 'wf-1',
            stepOrder: 1,
            stepType: 'position',
            positionId: 'pos-manager', // 課長
            approvalRoleId: null,
            specificUserId: null,
            isRequired: true,
            skipIfSamePerson: true,
            skipIfVacant: true,
            conditions: null,
            label: '課長承認',
            ...stepDefaults,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };

      const request: Request = {
        id: 'req-1',
        workflowId: 'wf-1',
        applicantId: 'user-tanaka',
        applicantOrganizationId: 'org-sales',
        title: 'テスト申請',
        content: {},
        status: 'pending',
        currentStep: 1,
        ...requestDefaults,
        createdAt: new Date(),
        updatedAt: new Date(),
        submittedAt: new Date(),
        completedAt: null,
      };

      const context: ApprovalContext = {
        request,
        applicant: mockUsers[0],
        applicantOrganization: mockOrganizations[1],
        workflow,
        currentDate: new Date(),
      };

      const route = await service.resolveApprovalRoute(context);

      expect(route).toHaveLength(1);
      // 鈴木が課長を兼務しているので、鈴木が承認者になる
      expect(route[0].approver?.id).toBe('user-suzuki');
      expect(route[0].status).toBe('pending');
    });

    it('兼務スキップ: 同一人物が複数ステップを担当する場合、後のステップをスキップ', async () => {
      const workflow: WorkflowWithSteps = {
        id: 'wf-1',
        name: 'テストワークフロー',
        description: '',
        category: 'テスト',
        isActive: true,
        formSchema: null,
        ...workflowDefaults,
        createdAt: new Date(),
        updatedAt: new Date(),
        steps: [
          {
            id: 'step-1',
            workflowId: 'wf-1',
            stepOrder: 1,
            stepType: 'position',
            positionId: 'pos-manager', // 課長 -> 鈴木
            approvalRoleId: null,
            specificUserId: null,
            isRequired: true,
            skipIfSamePerson: true,
            skipIfVacant: true,
            conditions: null,
            label: '課長承認',
            ...stepDefaults,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'step-2',
            workflowId: 'wf-1',
            stepOrder: 2,
            stepType: 'position',
            positionId: 'pos-director', // 部長 -> 鈴木
            approvalRoleId: null,
            specificUserId: null,
            isRequired: true,
            skipIfSamePerson: true, // 同一人物スキップ有効
            skipIfVacant: true,
            conditions: null,
            label: '部長承認',
            ...stepDefaults,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };

      // 課長承認済みの履歴をモック
      const mockHistory: ApprovalHistory[] = [
        {
          id: 'hist-1',
          requestId: 'req-1',
          stepOrder: 1,
          approverId: 'user-suzuki',
          action: 'approve',
          comment: null,
          skipReason: null,
          ...historyDefaults,
          createdAt: new Date(),
        },
      ];

      dataStore.getApprovalHistory = async () => mockHistory;

      const request: Request = {
        id: 'req-1',
        workflowId: 'wf-1',
        applicantId: 'user-tanaka',
        applicantOrganizationId: 'org-sales',
        title: 'テスト申請',
        content: {},
        status: 'pending',
        currentStep: 2,
        ...requestDefaults,
        createdAt: new Date(),
        updatedAt: new Date(),
        submittedAt: new Date(),
        completedAt: null,
      };

      const context: ApprovalContext = {
        request,
        applicant: mockUsers[0],
        applicantOrganization: mockOrganizations[1],
        workflow,
        currentDate: new Date(),
      };

      const route = await service.resolveApprovalRoute(context);

      expect(route).toHaveLength(2);
      // ステップ1: 鈴木が承認済み
      expect(route[0].status).toBe('approved');
      expect(route[0].approver?.id).toBe('user-suzuki');
      // ステップ2: 同一人物（鈴木）なのでスキップ
      expect(route[1].status).toBe('skipped');
      expect(route[1].skipReason).toBe('same_person');
    });

    it('条件分岐: 金額条件に該当しない場合スキップ', async () => {
      const workflow: WorkflowWithSteps = {
        id: 'wf-1',
        name: 'テストワークフロー',
        description: '',
        category: 'テスト',
        isActive: true,
        formSchema: null,
        ...workflowDefaults,
        createdAt: new Date(),
        updatedAt: new Date(),
        steps: [
          {
            id: 'step-1',
            workflowId: 'wf-1',
            stepOrder: 1,
            stepType: 'position',
            positionId: 'pos-manager',
            approvalRoleId: null,
            specificUserId: null,
            isRequired: true,
            skipIfSamePerson: true,
            skipIfVacant: true,
            conditions: null,
            label: '課長承認',
            ...stepDefaults,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'step-2',
            workflowId: 'wf-1',
            stepOrder: 2,
            stepType: 'position',
            positionId: 'pos-director',
            approvalRoleId: null,
            specificUserId: null,
            isRequired: true,
            skipIfSamePerson: true,
            skipIfVacant: true,
            conditions: [
              { field: 'amount', operator: 'gte', value: 100000 }, // 10万円以上
            ],
            label: '部長承認（10万円以上）',
            ...stepDefaults,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };

      const request: Request = {
        id: 'req-1',
        workflowId: 'wf-1',
        applicantId: 'user-tanaka',
        applicantOrganizationId: 'org-sales',
        title: 'テスト申請',
        content: { amount: 50000 }, // 5万円
        status: 'pending',
        currentStep: 1,
        ...requestDefaults,
        createdAt: new Date(),
        updatedAt: new Date(),
        submittedAt: new Date(),
        completedAt: null,
      };

      const context: ApprovalContext = {
        request,
        applicant: mockUsers[0],
        applicantOrganization: mockOrganizations[1],
        workflow,
        currentDate: new Date(),
      };

      const route = await service.resolveApprovalRoute(context);

      expect(route).toHaveLength(2);
      // ステップ1: 通常承認待ち
      expect(route[0].status).toBe('pending');
      // ステップ2: 金額条件に該当しないためスキップ
      expect(route[1].status).toBe('skipped');
      expect(route[1].skipReason).toBe('not_required');
    });
  });

  // ==================== Phase 1: resolveMultiApproverStatus ====================
  describe('resolveMultiApproverStatus', () => {
    it('single モード: 1人でも承認すれば approved', () => {
      const statuses = [
        { approverId: 'a', status: 'approved' },
        { approverId: 'b', status: 'pending' },
      ] as any[];
      expect(service.resolveMultiApproverStatus(statuses, 'single', null)).toBe('approved');
    });

    it('single モード: 全員pending なら pending', () => {
      const statuses = [
        { approverId: 'a', status: 'pending' },
        { approverId: 'b', status: 'pending' },
      ] as any[];
      expect(service.resolveMultiApproverStatus(statuses, 'single', null)).toBe('pending');
    });

    it('all モード: 全員承認で approved', () => {
      const statuses = [
        { approverId: 'a', status: 'approved' },
        { approverId: 'b', status: 'approved' },
      ] as any[];
      expect(service.resolveMultiApproverStatus(statuses, 'all', null)).toBe('approved');
    });

    it('all モード: 1人でも却下なら rejected', () => {
      const statuses = [
        { approverId: 'a', status: 'approved' },
        { approverId: 'b', status: 'rejected' },
      ] as any[];
      expect(service.resolveMultiApproverStatus(statuses, 'all', null)).toBe('rejected');
    });

    it('all モード: 残りがpendingなら pending', () => {
      const statuses = [
        { approverId: 'a', status: 'approved' },
        { approverId: 'b', status: 'pending' },
      ] as any[];
      expect(service.resolveMultiApproverStatus(statuses, 'all', null)).toBe('pending');
    });

    it('group モード: 必要人数に達したら approved', () => {
      const statuses = [
        { approverId: 'a', status: 'approved' },
        { approverId: 'b', status: 'approved' },
        { approverId: 'c', status: 'pending' },
      ] as any[];
      expect(service.resolveMultiApproverStatus(statuses, 'group', 2)).toBe('approved');
    });

    it('group モード: 残り全員承認しても足りない場合 rejected', () => {
      const statuses = [
        { approverId: 'a', status: 'rejected' },
        { approverId: 'b', status: 'rejected' },
        { approverId: 'c', status: 'pending' },
      ] as any[];
      // approved: 0, pending: 1 → 0+1=1 < 2 → rejected
      expect(service.resolveMultiApproverStatus(statuses, 'group', 2)).toBe('rejected');
    });

    it('notify モード: 常に approved', () => {
      const statuses = [
        { approverId: 'a', status: 'pending' },
      ] as any[];
      expect(service.resolveMultiApproverStatus(statuses, 'notify', null)).toBe('approved');
    });
  });

  // ==================== Phase 1: processRemandTarget ====================
  describe('processRemandTarget', () => {
    it('require_reapproval: 経路最初（0）に戻す', () => {
      expect(service.processRemandTarget('require_reapproval', 3)).toBe(0);
    });

    it('choose_at_remand: 指定ステップに戻す', () => {
      expect(service.processRemandTarget('choose_at_remand', 3, 1)).toBe(1);
    });

    it('choose_at_remand: 未指定なら0に戻す', () => {
      expect(service.processRemandTarget('choose_at_remand', 3)).toBe(0);
    });

    it('no_reapproval: 直前のステップに戻す', () => {
      expect(service.processRemandTarget('no_reapproval', 3)).toBe(2);
    });

    it('no_reapproval: ステップ1の場合は0', () => {
      expect(service.processRemandTarget('no_reapproval', 1)).toBe(0);
    });

    it('不明モード: デフォルトで0', () => {
      expect(service.processRemandTarget('unknown_mode', 5)).toBe(0);
    });
  });

  // ==================== Phase 1: generateDocNumber ====================
  describe('generateDocNumber', () => {
    it('年月+連番フォーマット', () => {
      const result = service.generateDocNumber('%Y%m-%N%N%N', 1);
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      expect(result).toBe(`${year}${month}-001`);
    });

    it('連番桁数が変わる', () => {
      const result = service.generateDocNumber('DOC-%N%N%N%N', 42);
      expect(result).toBe('DOC-0042');
    });

    it('日付を含むフォーマット', () => {
      const result = service.generateDocNumber('%Y/%m/%d-%N%N', 7);
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      expect(result).toBe(`${y}/${m}/${d}-07`);
    });

    it('大きい連番', () => {
      const result = service.generateDocNumber('REQ-%N%N%N', 999);
      expect(result).toBe('REQ-999');
    });
  });

  // ==================== Phase 1: canViewRequest ====================
  describe('canViewRequest', () => {
    const baseWorkflow: WorkflowDefinition = {
      id: 'wf-1',
      name: 'テスト',
      description: '',
      category: 'テスト',
      isActive: true,
      formSchema: null,
      ...workflowDefaults,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const baseRequest: Request = {
      id: 'req-1',
      workflowId: 'wf-1',
      applicantId: 'user-tanaka',
      applicantOrganizationId: 'org-sales',
      title: 'テスト申請',
      content: {},
      status: 'pending',
      currentStep: 1,
      ...requestDefaults,
      createdAt: new Date(),
      updatedAt: new Date(),
      submittedAt: new Date(),
      completedAt: null,
    };

    it('all: 誰でも閲覧可能', async () => {
      const wf = { ...baseWorkflow, viewingRestriction: 'all' as const };
      expect(await service.canViewRequest('user-sato', baseRequest, wf)).toBe(true);
    });

    it('specified_users: 申請者は閲覧可能', async () => {
      const wf = { ...baseWorkflow, viewingRestriction: 'specified_users' as const, viewingAllowedUsers: [] };
      expect(await service.canViewRequest('user-tanaka', baseRequest, wf)).toBe(true);
    });

    it('specified_users: 指定ユーザーは閲覧可能', async () => {
      const wf = { ...baseWorkflow, viewingRestriction: 'specified_users' as const, viewingAllowedUsers: ['user-sato'] };
      expect(await service.canViewRequest('user-sato', baseRequest, wf)).toBe(true);
    });

    it('specified_users: 未指定ユーザーは閲覧不可', async () => {
      const wf = { ...baseWorkflow, viewingRestriction: 'specified_users' as const, viewingAllowedUsers: ['user-sato'] };
      expect(await service.canViewRequest('user-suzuki', baseRequest, wf)).toBe(false);
    });

    it('route_members: contextなしで非申請者は閲覧不可', async () => {
      const wf = { ...baseWorkflow, viewingRestriction: 'route_members' as const };
      expect(await service.canViewRequest('user-sato', baseRequest, wf)).toBe(false);
    });

    it('route_members: 申請者は閲覧可能', async () => {
      const wf = { ...baseWorkflow, viewingRestriction: 'route_members' as const };
      expect(await service.canViewRequest('user-tanaka', baseRequest, wf)).toBe(true);
    });
  });

  // ==================== Phase 2: selectRoute ====================
  describe('selectRoute', () => {
    const basicRoute = {
      routeType: 'basic', priority: 1,
      targetPositionId: null, targetDepartmentId: null, targetUserId: null,
      isActive: true, conditions: null,
    };

    const deptRoute = {
      routeType: 'by_department', priority: 3,
      targetPositionId: null, targetDepartmentId: 'org-sales', targetUserId: null,
      isActive: true, conditions: null,
    };

    const individualRoute = {
      routeType: 'by_individual', priority: 4,
      targetPositionId: null, targetDepartmentId: null, targetUserId: 'user-tanaka',
      isActive: true, conditions: null,
    };

    it('最も優先度が高い経路を選択する', () => {
      const result = service.selectRoute(
        [basicRoute, deptRoute, individualRoute],
        'user-tanaka', 'pos-staff', 'org-sales'
      );
      expect(result).toBe(individualRoute);
    });

    it('マッチしない経路はスキップ', () => {
      const result = service.selectRoute(
        [basicRoute, individualRoute],
        'user-suzuki', 'pos-director', 'org-sales'  // 個人経路はtanakaのみ
      );
      expect(result).toBe(basicRoute);
    });

    it('非アクティブ経路はスキップ', () => {
      const inactiveIndividual = { ...individualRoute, isActive: false };
      const result = service.selectRoute(
        [basicRoute, inactiveIndividual],
        'user-tanaka', 'pos-staff', 'org-sales'
      );
      expect(result).toBe(basicRoute);
    });

    it('空配列なら null', () => {
      const result = service.selectRoute([], 'user-tanaka', 'pos-staff', 'org-sales');
      expect(result).toBeNull();
    });

    it('条件付き経路: フォーム内容でフィルタ', () => {
      const condRoute = {
        routeType: 'basic', priority: 10,
        targetPositionId: null, targetDepartmentId: null, targetUserId: null,
        isActive: true,
        conditions: [{ field: 'amount', operator: 'gte', value: 100000 }],
      };
      // 金額不足 → condRouteはマッチしない
      const result1 = service.selectRoute(
        [basicRoute, condRoute],
        'user-tanaka', null, 'org-sales',
        { amount: 50000 }
      );
      expect(result1).toBe(basicRoute);

      // 金額十分 → condRouteが最優先
      const result2 = service.selectRoute(
        [basicRoute, condRoute],
        'user-tanaka', null, 'org-sales',
        { amount: 200000 }
      );
      expect(result2).toBe(condRoute);
    });

    it('部署別経路: 部署が一致する場合選択', () => {
      const result = service.selectRoute(
        [basicRoute, deptRoute],
        'user-tanaka', 'pos-staff', 'org-sales'
      );
      expect(result).toBe(deptRoute);
    });

    it('部署別経路: 部署が不一致の場合スキップ', () => {
      const result = service.selectRoute(
        [basicRoute, deptRoute],
        'user-tanaka', 'pos-staff', 'org-accounting'  // 経理部
      );
      expect(result).toBe(basicRoute);
    });
  });
});

// ============================================================
// ProxyService テスト
// ============================================================
describe('ProxyService', () => {
  const now = new Date('2025-06-15T10:00:00Z');
  const pastDate = new Date('2025-01-01T00:00:00Z');
  const futureDate = new Date('2025-12-31T23:59:59Z');
  const farFuture = new Date('2026-06-01T00:00:00Z');

  const baseSetting: ProxySetting = {
    id: 'proxy-1',
    principalUserId: 'user-principal',
    proxyUserId: 'user-proxy',
    proxyType: 'application',
    targetRoles: [],
    validFrom: pastDate,
    validTo: futureDate,
    isActive: true,
    createdAt: pastDate,
    updatedAt: pastDate,
  };

  const processSetting: ProxySetting = {
    ...baseSetting,
    id: 'proxy-2',
    proxyType: 'processing',
    targetRoles: ['approver', 'final_approver'],
  };

  let proxyService: ProxyService;
  let mockSettings: ProxySetting[];

  beforeEach(() => {
    mockSettings = [baseSetting, processSetting];
    const mockStore: ProxyDataStore = {
      getProxySettings: async () => mockSettings,
    };
    proxyService = new ProxyService(mockStore);
  });

  describe('canApplyAsProxy', () => {
    it('有効な代理申請設定がある場合true', async () => {
      const result = await proxyService.canApplyAsProxy('user-proxy', 'user-principal', now);
      expect(result).toBe(true);
    });

    it('代理者IDが一致しない場合false', async () => {
      const result = await proxyService.canApplyAsProxy('user-other', 'user-principal', now);
      expect(result).toBe(false);
    });

    it('委任元IDが一致しない場合false', async () => {
      const result = await proxyService.canApplyAsProxy('user-proxy', 'user-other', now);
      expect(result).toBe(false);
    });

    it('processing設定ではapplicationとしてfalse', async () => {
      mockSettings = [processSetting];
      const result = await proxyService.canApplyAsProxy('user-proxy', 'user-principal', now);
      expect(result).toBe(false);
    });

    it('非アクティブな設定はスキップ', async () => {
      mockSettings = [{ ...baseSetting, isActive: false }];
      const result = await proxyService.canApplyAsProxy('user-proxy', 'user-principal', now);
      expect(result).toBe(false);
    });

    it('有効期限切れの設定はスキップ', async () => {
      const result = await proxyService.canApplyAsProxy('user-proxy', 'user-principal', farFuture);
      expect(result).toBe(false);
    });

    it('validToがnullの場合は期限なし', async () => {
      mockSettings = [{ ...baseSetting, validTo: null }];
      const result = await proxyService.canApplyAsProxy('user-proxy', 'user-principal', farFuture);
      expect(result).toBe(true);
    });
  });

  describe('canProcessAsProxy', () => {
    it('有効な代理処理設定がある場合true', async () => {
      const result = await proxyService.canProcessAsProxy('user-proxy', 'user-principal', 'approver', now);
      expect(result).toBe(true);
    });

    it('対象ロールに含まれないロールの場合false', async () => {
      const result = await proxyService.canProcessAsProxy('user-proxy', 'user-principal', 'handler', now);
      expect(result).toBe(false);
    });

    it('targetRolesが空の場合は全ロール対象', async () => {
      mockSettings = [{ ...processSetting, targetRoles: [] }];
      const result = await proxyService.canProcessAsProxy('user-proxy', 'user-principal', 'handler', now);
      expect(result).toBe(true);
    });

    it('stepRoleTypeが未指定の場合はロールチェックスキップ', async () => {
      const result = await proxyService.canProcessAsProxy('user-proxy', 'user-principal', undefined, now);
      expect(result).toBe(true);
    });

    it('application設定ではprocessingとしてfalse', async () => {
      mockSettings = [baseSetting];
      const result = await proxyService.canProcessAsProxy('user-proxy', 'user-principal', 'approver', now);
      expect(result).toBe(false);
    });
  });

  describe('getProxiesForUser', () => {
    it('代理者の委任元一覧を取得', async () => {
      const result = await proxyService.getProxiesForUser('user-proxy', now);
      expect(result).toHaveLength(2);
    });

    it('該当する代理設定がない場合は空配列', async () => {
      const result = await proxyService.getProxiesForUser('user-nobody', now);
      expect(result).toHaveLength(0);
    });

    it('有効期限内のみ返却', async () => {
      const result = await proxyService.getProxiesForUser('user-proxy', farFuture);
      expect(result).toHaveLength(0);
    });
  });

  describe('getPrincipalsForProxy', () => {
    it('委任元の代理先一覧を取得', async () => {
      const result = await proxyService.getPrincipalsForProxy('user-principal', now);
      expect(result).toHaveLength(2);
    });

    it('該当する設定がない場合は空配列', async () => {
      const result = await proxyService.getPrincipalsForProxy('user-nobody', now);
      expect(result).toHaveLength(0);
    });
  });
});
