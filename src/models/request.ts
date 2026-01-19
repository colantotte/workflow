import { z } from 'zod';

// 申請ステータス
export const RequestStatus = z.enum([
  'draft',      // 下書き
  'pending',    // 承認待ち
  'approved',   // 承認完了
  'rejected',   // 却下
  'cancelled',  // 取消し
  'remanded',   // 差戻し
]);

export type RequestStatus = z.infer<typeof RequestStatus>;

// 承認アクション
export const ApprovalAction = z.enum([
  'approve',  // 承認
  'reject',   // 却下
  'remand',   // 差戻し
  'skip',     // スキップ（システム自動）
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
});

export type ApprovalHistory = z.infer<typeof ApprovalHistorySchema>;

export const CreateApprovalHistorySchema = ApprovalHistorySchema.omit({
  id: true,
  createdAt: true,
});

export type CreateApprovalHistory = z.infer<typeof CreateApprovalHistorySchema>;

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
}

// 申請詳細（承認ルート含む）
export interface RequestWithRoute extends Request {
  approvalRoute: ResolvedApprovalStep[];
  history: ApprovalHistory[];
}
