import { z } from 'zod';

// 承認ステップタイプ
export const ApprovalStepType = z.enum([
  'position',       // 役職ベース（申請者の組織の課長など）
  'role',           // 承認ロールベース（経理承認者など）
  'specific_user',  // 特定ユーザー指定
]);

export type ApprovalStepType = z.infer<typeof ApprovalStepType>;

// フォームフィールドタイプ
export const FormFieldType = z.enum([
  'text',       // テキスト入力
  'number',     // 数値入力
  'date',       // 日付入力
  'select',     // 選択肢
  'textarea',   // 複数行テキスト
  'file',       // ファイル添付
  'checkbox',   // チェックボックス
]);

export type FormFieldType = z.infer<typeof FormFieldType>;

// フォームフィールド定義
export const FormFieldSchema = z.object({
  name: z.string().min(1),              // フィールド名（キー）
  label: z.string().min(1),             // 表示ラベル
  type: FormFieldType,
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
  options: z.array(z.object({           // select用の選択肢
    value: z.string(),
    label: z.string(),
  })).optional(),
  validation: z.object({                // バリデーションルール
    min: z.number().optional(),         // 最小値（number）/ 最小文字数（text）
    max: z.number().optional(),         // 最大値（number）/ 最大文字数（text）
    pattern: z.string().optional(),     // 正規表現パターン
  }).optional(),
  defaultValue: z.unknown().optional(),
});

export type FormField = z.infer<typeof FormFieldSchema>;

// フォームスキーマ
export const FormSchemaDefinition = z.object({
  fields: z.array(FormFieldSchema),
});

export type FormSchema = z.infer<typeof FormSchemaDefinition>;

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
  formSchema: FormSchemaDefinition.nullable().default(null), // フォーム定義
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

// 経費精算フォーム
export const EXPENSE_FORM_SCHEMA: FormSchema = {
  fields: [
    {
      name: 'amount',
      label: '金額',
      type: 'number',
      required: true,
      placeholder: '金額を入力',
      validation: { min: 1 },
    },
    {
      name: 'expenseDate',
      label: '支出日',
      type: 'date',
      required: true,
    },
    {
      name: 'category',
      label: '経費区分',
      type: 'select',
      required: true,
      options: [
        { value: 'travel', label: '交通費' },
        { value: 'entertainment', label: '交際費' },
        { value: 'supplies', label: '消耗品費' },
        { value: 'communication', label: '通信費' },
        { value: 'other', label: 'その他' },
      ],
    },
    {
      name: 'description',
      label: '内容・目的',
      type: 'textarea',
      required: true,
      placeholder: '経費の内容と目的を入力',
    },
    {
      name: 'receipt',
      label: '領収書添付',
      type: 'checkbox',
      required: false,
    },
  ],
};

// 休暇申請フォーム
export const LEAVE_FORM_SCHEMA: FormSchema = {
  fields: [
    {
      name: 'leaveType',
      label: '休暇種別',
      type: 'select',
      required: true,
      options: [
        { value: 'paid', label: '有給休暇' },
        { value: 'special', label: '特別休暇' },
        { value: 'substitute', label: '代休' },
        { value: 'unpaid', label: '欠勤' },
      ],
    },
    {
      name: 'startDate',
      label: '開始日',
      type: 'date',
      required: true,
    },
    {
      name: 'endDate',
      label: '終了日',
      type: 'date',
      required: true,
    },
    {
      name: 'reason',
      label: '理由',
      type: 'textarea',
      required: false,
      placeholder: '休暇の理由（任意）',
    },
  ],
};

// サンプルワークフロー
export const SAMPLE_WORKFLOWS: Omit<WorkflowDefinition, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: '経費精算（10万円未満）',
    description: '10万円未満の経費精算申請',
    category: '経費精算',
    formSchema: EXPENSE_FORM_SCHEMA,
    isActive: true,
  },
  {
    name: '経費精算（10万円以上）',
    description: '10万円以上の経費精算申請（取締役決裁必要）',
    category: '経費精算',
    formSchema: EXPENSE_FORM_SCHEMA,
    isActive: true,
  },
  {
    name: '稟議申請',
    description: '一般稟議申請',
    category: '稟議',
    formSchema: null,
    isActive: true,
  },
  {
    name: '休暇申請',
    description: '有給休暇・特別休暇申請',
    category: '休暇申請',
    formSchema: LEAVE_FORM_SCHEMA,
    isActive: true,
  },
];
