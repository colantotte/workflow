import { describe, it, expect, beforeEach } from 'vitest';
import { ApprovalService, type DataStore, type ApprovalContext } from '../services/approval.service.js';
import type {
  User,
  UserPosition,
  UserApprovalRole,
  Organization,
  Position,
  WorkflowWithSteps,
  ApprovalStep,
  Request,
  ApprovalHistory,
} from '../models/index.js';

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
  { id: 'user-tanaka', larkUserId: 'ou_tanaka', name: '田中太郎', email: 'tanaka@example.com', isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'user-suzuki', larkUserId: 'ou_suzuki', name: '鈴木一郎', email: 'suzuki@example.com', isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 'user-sato', larkUserId: 'ou_sato', name: '佐藤花子', email: 'sato@example.com', isActive: true, createdAt: new Date(), updatedAt: new Date() },
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
});
