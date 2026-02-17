import { z } from 'zod';

// 申請ステータス
export const RequestStatus = z.enum([
  'draft',                    // 下書き
  'pending',                  // 承認待ち
  'approved',                 // 承認完了
  'rejected',                 // 却下
  'cancelled',                // 取消し
  'remanded',                 // 差戻し
  'withdrawn',                // 取り下げ
  'conditional_approve_wait', // 条件付き承認（コメント待ち）
]);

export type RequestStatus = z.infer<typeof RequestStatus>;

// 承認アクション
export const ApprovalAction = z.enum([
  'approve',             // 承認
  'reject',              // 却下
  'remand',              // 差戻し
  'skip',                // スキップ（システム自動）
  'pull_up',             // 引き上げ
  'conditional_approve', // 条件付き承認
  'notify_complete',     // 通知確認完了
]);

export type ApprovalAction = z.infer<typeof ApprovalAction>;

// スキップ理由
export const SkipReason = z.enum([
  'vacant',       // 空席
  'same_person',  // 同一人物
  'not_required', // 条件不該当
]);

export type SkipReason = z.infer<typeof SkipReason>;

// 申請
export const RequestSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  applicantId: z.string(),
  applicantOrganizationId: z.string(), // 申請時の所属組織（組織コード）
  title: z.string().min(1).max(200),
  content: z.record(z.unknown()),             // 申請内容（JSON）
  status: RequestStatus,
  currentStep: z.number().int().min(0),       // 現在の承認ステップ（0=未提出）
  createdAt: z.date(),
  updatedAt: z.date(),
  submittedAt: z.date().nullable(),           // 提出日時
  completedAt: z.date().nullable(),           // 完了日時

  // Phase 1: NI Collabo 360 拡張
  proxyApplicantId: z.string().nullable().default(null),  // 代理申請者
  withdrawnAt: z.date().nullable().default(null),         // 取り下げ日時
  routeMasterId: z.string().nullable().default(null),     // 使用経路マスタ
  docNumber: z.string().nullable().default(null),         // 自動採番された番号
});

export type Request = z.infer<typeof RequestSchema>;

export const CreateRequestSchema = RequestSchema.omit({
  id: true,
  status: true,
  currentStep: true,
  createdAt: true,
  updatedAt: true,
  submittedAt: true,
  completedAt: true,
}).extend({
  status: RequestStatus.default('draft'),
  currentStep: z.number().int().default(0),
});

export type CreateRequest = z.infer<typeof CreateRequestSchema>;

// 承認履歴
export const ApprovalHistorySchema = z.object({
  id: z.string(),
  requestId: z.string(),
  stepOrder: z.number().int(),
  approverId: z.string().nullable(),   // スキップ時はnull
  action: ApprovalAction,
  comment: z.string().max(1000).nullable(),
  skipReason: SkipReason.nullable(),
  createdAt: z.date(),

  // Phase 1: 拡張
  proxyApproverId: z.string().nullable().default(null),  // 代理承認者
  editedFields: z.record(z.unknown()).nullable().default(null), // 承認時編集内容

  // NI Collabo: 条件付き承認（19-11-7）
  conditionalApproveTargetSteps: z.array(z.number().int()).nullable().default(null), // コメント要求先ステップ
});

export type ApprovalHistory = z.infer<typeof ApprovalHistorySchema>;

export const CreateApprovalHistorySchema = ApprovalHistorySchema.omit({
  id: true,
  createdAt: true,
});

export type CreateApprovalHistory = z.infer<typeof CreateApprovalHistorySchema>;

// 個別承認者ステータス（複数承認者用）
export interface ApproverStatus {
  approverId: string;
  approverName: string;
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  comment: string | null;
  processedAt: Date | null;
  proxyApproverId: string | null;
}

// 承認ルート（解決済み）
export interface ResolvedApprovalStep {
  stepOrder: number;
  stepType: string;
  label: string | null;
  approver: {
    id: string;
    name: string;
    email: string;
  } | null;
  status: 'pending' | 'approved' | 'rejected' | 'skipped' | 'waiting';
  skipReason: SkipReason | null;
  comment: string | null;
  processedAt: Date | null;

  // Phase 1: 拡張
  stepRoleType?: string;
  multiApproverMode?: string;
  approvers?: ApproverStatus[];         // 複数承認者の個別状態
  deadlineDate?: Date | null;           // 期限日
  remainingDays?: number | null;        // 残日数
  editableFields?: string[] | null;     // 編集可能フィールド
}

// ステップ承認状況（複数承認者の個別状態追跡テーブル）
export const StepApprovalStatusSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  stepOrder: z.number().int(),
  approverId: z.string(),
  status: z.enum(['pending', 'approved', 'rejected', 'skipped']).default('pending'),
  comment: z.string().max(1000).nullable().default(null),
  processedAt: z.date().nullable().default(null),
  proxyApproverId: z.string().nullable().default(null),
});

export type StepApprovalStatus = z.infer<typeof StepApprovalStatusSchema>;

// 申請詳細（承認ルート含む）
export interface RequestWithRoute extends Request {
  approvalRoute: ResolvedApprovalStep[];
  history: ApprovalHistory[];
}
