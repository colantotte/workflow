import { z } from 'zod';

// 承認ロール（ワークフロー専用役職）
export const ApprovalRoleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ApprovalRole = z.infer<typeof ApprovalRoleSchema>;

export const CreateApprovalRoleSchema = ApprovalRoleSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateApprovalRole = z.infer<typeof CreateApprovalRoleSchema>;

// サンプル承認ロール
export const SAMPLE_APPROVAL_ROLES: Omit<ApprovalRole, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: '経理承認者', description: '経費精算・予算執行の承認', isActive: true },
  { name: '法務確認者', description: '契約・法務関連の確認', isActive: true },
  { name: '取締役決裁', description: '取締役会決裁事項の承認', isActive: true },
  { name: '人事承認者', description: '人事関連申請の承認', isActive: true },
  { name: '情報セキュリティ管理者', description: 'セキュリティ関連の承認', isActive: true },
];
