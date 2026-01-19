import { z } from 'zod';

// ユーザー
export const UserSchema = z.object({
  id: z.string().uuid(),
  larkUserId: z.string().min(1),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;

export const CreateUserSchema = UserSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateUser = z.infer<typeof CreateUserSchema>;

// ユーザー役職（組織に紐づく実役職）
export const UserPositionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
  positionId: z.string().uuid(),
  isPrimary: z.boolean().default(false), // 主務フラグ
  validFrom: z.date(),
  validTo: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type UserPosition = z.infer<typeof UserPositionSchema>;

export const CreateUserPositionSchema = UserPositionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateUserPosition = z.infer<typeof CreateUserPositionSchema>;

// ユーザー承認ロール（ワークフロー専用役職）
export const UserApprovalRoleSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  approvalRoleId: z.string().uuid(),
  targetOrganizationId: z.string().uuid().nullable(), // null = 全組織対象
  validFrom: z.date(),
  validTo: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type UserApprovalRole = z.infer<typeof UserApprovalRoleSchema>;

export const CreateUserApprovalRoleSchema = UserApprovalRoleSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateUserApprovalRole = z.infer<typeof CreateUserApprovalRoleSchema>;

// 拡張ユーザー情報（役職・承認ロール含む）
export interface UserWithRoles extends User {
  positions: UserPosition[];
  approvalRoles: UserApprovalRole[];
}
