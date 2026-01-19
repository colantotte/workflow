import { z } from 'zod';

// 承認ステップタイプ
export const ApprovalStepType = z.enum([
  'position',       // 役職ベース（申請者の組織の課長など）
  'role',           // 承認ロールベース（経理承認者など）
  'specific_user',  // 特定ユーザー指定
]);

export type ApprovalStepType = z.infer<typeof ApprovalStepType>;

// 条件演算子
export const ConditionOperator = z.enum([
  'eq',  // 等しい
  'ne',  // 等しくない
  'gt',  // より大きい
  'gte', // 以上
  'lt',  // より小さい
  'lte', // 以下
  'in',  // 含まれる
]);

export type ConditionOperator = z.infer<typeof ConditionOperator>;

// 承認ステップ条件
export const StepConditionSchema = z.object({
  field: z.string(),           // 対象フィールド（例: amount）
  operator: ConditionOperator,
  value: z.union([z.string(), z.number(), z.array(z.string())]),
});

export type StepCondition = z.infer<typeof StepConditionSchema>;

// ワークフロー定義
export const WorkflowDefinitionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  category: z.string().min(1).max(50), // 経費精算, 稟議, 休暇申請 など
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

export const CreateWorkflowDefinitionSchema = WorkflowDefinitionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateWorkflowDefinition = z.infer<typeof CreateWorkflowDefinitionSchema>;

// 承認ステップ
export const ApprovalStepSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string().uuid(),
  stepOrder: z.number().int().min(1),
  stepType: ApprovalStepType,

  // step_type によって使用されるフィールド
  positionId: z.string().uuid().nullable(),        // position 時
  approvalRoleId: z.string().uuid().nullable(),    // role 時
  specificUserId: z.string().uuid().nullable(),    // specific_user 時

  // オプション設定
  isRequired: z.boolean().default(true),           // 必須承認
  skipIfSamePerson: z.boolean().default(true),     // 同一人物スキップ
  skipIfVacant: z.boolean().default(true),         // 空席スキップ

  // 条件（金額分岐など）
  conditions: z.array(StepConditionSchema).nullable(),

  // メタデータ
  label: z.string().max(100).nullable(),           // 表示名（例: "部長承認"）

  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ApprovalStep = z.infer<typeof ApprovalStepSchema>;

export const CreateApprovalStepSchema = ApprovalStepSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateApprovalStep = z.infer<typeof CreateApprovalStepSchema>;

// ワークフロー定義（ステップ含む）
export interface WorkflowWithSteps extends WorkflowDefinition {
  steps: ApprovalStep[];
}

// サンプルワークフロー
export const SAMPLE_WORKFLOWS: Omit<WorkflowDefinition, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: '経費精算（10万円未満）',
    description: '10万円未満の経費精算申請',
    category: '経費精算',
    isActive: true,
  },
  {
    name: '経費精算（10万円以上）',
    description: '10万円以上の経費精算申請（取締役決裁必要）',
    category: '経費精算',
    isActive: true,
  },
  {
    name: '稟議申請',
    description: '一般稟議申請',
    category: '稟議',
    isActive: true,
  },
  {
    name: '休暇申請',
    description: '有給休暇・特別休暇申請',
    category: '休暇申請',
    isActive: true,
  },
];
