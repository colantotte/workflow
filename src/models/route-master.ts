import { z } from 'zod';

// 経路タイプ（優先度順）
export const RouteType = z.enum(['basic', 'by_position', 'by_department', 'by_individual']);
export type RouteTypeValue = z.infer<typeof RouteType>;

// 経路タイプの優先度マップ
export const ROUTE_TYPE_PRIORITY: Record<RouteTypeValue, number> = {
  basic: 1,
  by_position: 2,
  by_department: 3,
  by_individual: 4,
};

// 経路マスタスキーマ
export const RouteMasterSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  workflowId: z.string().uuid(),
  routeType: RouteType.default('basic'),
  priority: z.number().int().min(1).max(100).default(1),

  // 条件マッチ用（routeTypeに応じて使用）
  targetPositionId: z.string().uuid().nullable().default(null),     // by_position 時
  targetDepartmentId: z.string().uuid().nullable().default(null),   // by_department 時
  targetUserId: z.string().uuid().nullable().default(null),         // by_individual 時

  isStandard: z.boolean().default(false),  // 標準経路フラグ
  isActive: z.boolean().default(true),

  // 追加条件（JSONで柔軟に）
  conditions: z.array(z.object({
    field: z.string(),
    operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains']),
    value: z.union([z.string(), z.number(), z.boolean()]),
  })).nullable().default(null),

  createdAt: z.date(),
  updatedAt: z.date(),
});

export type RouteMaster = z.infer<typeof RouteMasterSchema>;

export const CreateRouteMasterSchema = RouteMasterSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateRouteMaster = z.input<typeof CreateRouteMasterSchema>;

// 経路ステップスキーマ（ApprovalStepと同等のフィールド群）
export const RouteStepSchema = z.object({
  id: z.string().uuid(),
  routeMasterId: z.string().uuid(),
  stepOrder: z.number().int().min(1),
  stepType: z.enum(['position', 'role', 'specific_user']),

  positionId: z.string().uuid().nullable().default(null),
  approvalRoleId: z.string().uuid().nullable().default(null),
  specificUserId: z.string().uuid().nullable().default(null),

  label: z.string().nullable().default(null),
  isRequired: z.boolean().default(true),
  skipIfSamePerson: z.boolean().default(true),
  skipIfVacant: z.boolean().default(true),

  conditions: z.array(z.object({
    field: z.string(),
    operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains']),
    value: z.union([z.string(), z.number(), z.boolean()]),
  })).nullable().default(null),

  // Phase 1 拡張フィールド
  stepRoleType: z.enum(['approver', 'final_approver', 'handler', 'notifier']).default('approver'),
  multiApproverMode: z.enum(['single', 'all', 'group', 'notify']).default('single'),
  requiredApproverCount: z.number().int().nullable().default(null),
  deadlineDays: z.number().int().min(1).max(99).nullable().default(null),
  deadlineAutoAction: z.enum(['none', 'auto_approve', 'auto_reject']).default('none'),
  remandMode: z.enum(['require_reapproval', 'choose_at_remand', 'no_reapproval']).default('require_reapproval'),
  allowSelfApproval: z.boolean().default(false),
  editableFields: z.array(z.string()).nullable().default(null),

  createdAt: z.date(),
  updatedAt: z.date(),
});

export type RouteStep = z.infer<typeof RouteStepSchema>;

export const CreateRouteStepSchema = RouteStepSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateRouteStep = z.input<typeof CreateRouteStepSchema>;

// 経路マスタ + ステップ
export interface RouteMasterWithSteps extends RouteMaster {
  steps: RouteStep[];
}
