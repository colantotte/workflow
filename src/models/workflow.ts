import { z } from 'zod';

// 承認ステップタイプ
export const ApprovalStepType = z.enum([
  'position',       // 役職ベース（申請者の組織の課長など）
  'role',           // 承認ロールベース（経理承認者など）
  'specific_user',  // 特定ユーザー指定
]);

export type ApprovalStepType = z.infer<typeof ApprovalStepType>;

// ステップ役割タイプ（NI Collabo 360準拠）
export const StepRoleType = z.enum([
  'approver',        // 承認者
  'final_approver',  // 決裁者
  'handler',         // 業務担当者
  'notifier',        // 通知のみ
]);

export type StepRoleType = z.infer<typeof StepRoleType>;

// 複数承認者モード
export const MultiApproverMode = z.enum([
  'single',  // 単独承認（最初の1人）
  'all',     // 全員承認
  'group',   // グループ承認（N人以上）
  'notify',  // 通知のみ（承認不要）
]);

export type MultiApproverMode = z.infer<typeof MultiApproverMode>;

// 期限自動アクション
export const DeadlineAutoAction = z.enum([
  'none',          // なし
  'auto_approve',  // 自動承認
  'auto_reject',   // 自動却下
]);

export type DeadlineAutoAction = z.infer<typeof DeadlineAutoAction>;

// 差戻モード
export const RemandMode = z.enum([
  'require_reapproval',  // 差戻後再承認必須（経路最初から）
  'choose_at_remand',    // 差戻時に選択
  'no_reapproval',       // 再承認不要（差戻先から再開）
]);

export type RemandMode = z.infer<typeof RemandMode>;

// フォームフィールドタイプ
export const FormFieldType = z.enum([
  'text',              // テキスト入力
  'number',            // 数値入力
  'date',              // 日付入力
  'select',            // 選択肢
  'textarea',          // 複数行テキスト
  'file',              // ファイル添付
  'checkbox',          // チェックボックス
  'time',              // 時刻選択
  'radio',             // ラジオボタン
  'employee_select',   // 社員選択
  'department_select', // 部署選択
  'auto_calc',         // 自動計算
  'detail_table',      // 明細テーブル
]);

export type FormFieldType = z.infer<typeof FormFieldType>;

// 表示条件・必須条件スキーマ
export const FieldConditionSchema = z.object({
  field: z.string(),                    // 対象フィールド名
  operator: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'not_empty', 'empty']),
  value: z.union([z.string(), z.number(), z.array(z.string())]).optional(),
});

export type FieldCondition = z.infer<typeof FieldConditionSchema>;

// 明細テーブル列定義
export const DetailColumnSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'number', 'select', 'date']),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  enableTotal: z.boolean().default(false),  // 合計行表示
});

export type DetailColumn = z.infer<typeof DetailColumnSchema>;

// フォームフィールド定義
export const FormFieldSchema = z.object({
  name: z.string().min(1),              // フィールド名（キー）
  label: z.string().min(1),             // 表示ラベル
  type: FormFieldType,
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
  options: z.array(z.object({           // select/radio用の選択肢
    value: z.string(),
    label: z.string(),
  })).optional(),
  validation: z.object({                // バリデーションルール
    min: z.number().optional(),         // 最小値（number）/ 最小文字数（text）
    max: z.number().optional(),         // 最大値（number）/ 最大文字数（text）
    pattern: z.string().optional(),     // 正規表現パターン
  }).optional(),
  defaultValue: z.unknown().optional(),

  // Phase 3: 表示条件・関連必須
  displayCondition: FieldConditionSchema.nullable().optional(),   // 表示条件
  requiredCondition: FieldConditionSchema.nullable().optional(),  // 関連必須条件

  // Phase 3: 自動計算
  calcFormula: z.string().nullable().optional(),         // 計算式 "{quantity} * {price}"
  calcDecimalPlaces: z.number().int().min(0).max(4).optional(),
  calcRounding: z.enum(['round', 'floor', 'ceil']).optional(),

  // Phase 3: 明細テーブル
  detailColumns: z.array(DetailColumnSchema).max(5).optional(),

  // Phase 3: 時刻・ラジオ
  timeInterval: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20), z.literal(30)]).optional(),
  radioLayout: z.enum(['horizontal', 'vertical', 'wrap']).optional(),

  // Phase 3: 経路条件判定用
  conditionValue: z.number().nullable().optional(),

  // NI Collabo: 吹き出し（ツールチップ）
  tooltip: z.string().nullable().optional(),

  // NI Collabo: 役割別編集可否（未指定=全員編集可能）
  editableByRoles: z.array(StepRoleType).nullable().optional(),  // ['approver','final_approver'] etc.
  editDisabled: z.boolean().default(false),                       // true=全役割で編集不可
});

export type FormField = z.infer<typeof FormFieldSchema>;

// 大小比較バリデーション（NI Collabo 19-6: フィールド間の大小比較）
export const SizeComparisonSchema = z.object({
  fieldA: z.string().min(1),       // 小さい側のフィールド名
  fieldB: z.string().min(1),       // 大きい側のフィールド名
  operator: z.enum(['lt', 'lte']), // lt: A < B, lte: A <= B
  errorMessage: z.string().optional(),
});

export type SizeComparison = z.infer<typeof SizeComparisonSchema>;

// フォームスキーマ
export const FormSchemaDefinition = z.object({
  fields: z.array(FormFieldSchema),
  sizeComparisons: z.array(SizeComparisonSchema).default([]), // 大小比較ルール
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

// 閲覧制限タイプ
export const ViewingRestriction = z.enum([
  'all',              // 全員閲覧可能
  'route_members',    // 経路メンバーのみ
  'department',       // 同一部署のみ
  'specified_users',  // 指定ユーザーのみ
]);

export type ViewingRestriction = z.infer<typeof ViewingRestriction>;

// 通知設定
export const NotificationSettingsSchema = z.object({
  notifyNextApprover: z.boolean().default(true),        // 次の承認者に通知
  notifyOnComplete: z.boolean().default(true),           // 決裁完了時に申請者通知
  notifyRouteOnComplete: z.boolean().default(false),     // 決裁完了時に経路全員通知
  notifyOnRemand: z.boolean().default(true),             // 差戻時に通知
});

export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;

// 件名自動入力モード（NI Collabo 19-6）
export const SubjectAutoInputMode = z.enum([
  'none',          // 手動入力
  'from_basic',    // 基本項目から自動生成（ワークフロー名 + 日付）
  'from_fields',   // 全フィールドから自動生成
  'template',      // テンプレート指定 "{category} - {amount}円"
]);

export type SubjectAutoInputMode = z.infer<typeof SubjectAutoInputMode>;

// PDF設定
export const PdfSettingsSchema = z.object({
  pdfEnabled: z.boolean().default(false),
  pdfPaperSize: z.enum(['A4_portrait', 'A4_landscape', 'B5_portrait', 'B5_landscape']).default('A4_portrait'),
  pdfMargins: z.object({
    top: z.number().default(20),
    right: z.number().default(15),
    bottom: z.number().default(20),
    left: z.number().default(15),
  }).optional(),
});

export type PdfSettings = z.infer<typeof PdfSettingsSchema>;

// ワークフロー定義
export const WorkflowDefinitionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  category: z.string().min(1).max(50), // 経費精算, 稟議, 休暇申請 など
  formSchema: FormSchemaDefinition.nullable().default(null), // フォーム定義
  isActive: z.boolean().default(true),

  // Phase 1: 自動採番
  numberFormat: z.string().nullable().default(null),     // "%Y%m-%N%N%N"
  nextNumber: z.number().int().default(1),

  // Phase 1: 操作許可
  allowWithdrawal: z.boolean().default(false),           // 取り下げ許可
  allowPullUp: z.boolean().default(false),               // 引き上げ許可
  allowReuse: z.boolean().default(false),                // 再利用許可

  // Phase 4: 閲覧制限
  viewingRestriction: ViewingRestriction.default('all'),
  viewingAllowedUsers: z.array(z.string()).default([]),
  allowProxyViewing: z.boolean().default(false),

  // Phase 5: PDF設定
  pdfSettings: PdfSettingsSchema.nullable().default(null),

  // Phase 5: 通知設定
  notificationSettings: NotificationSettingsSchema.nullable().default(null),

  // NI Collabo: 件名自動入力
  subjectAutoInputMode: SubjectAutoInputMode.default('none'),
  subjectTemplate: z.string().nullable().default(null),  // template モード用 "{category} - {amount}円"

  // NI Collabo: 経路変更許可（19-11）
  allowRouteChange: z.boolean().default(false),
  routeChangeRoles: z.array(StepRoleType).default([]),  // 経路変更可能な役割

  // NI Collabo: 代理処理依頼（19-11）
  proxyProcessingAutoNotify: z.boolean().default(false),       // 自動通知有効
  proxyProcessingTimeoutDays: z.number().int().min(1).max(30).nullable().default(null), // N日後に代理者へ通知

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

  // Phase 1: NI Collabo 360 拡張フィールド
  stepRoleType: StepRoleType.default('approver'),
  multiApproverMode: MultiApproverMode.default('single'),
  requiredApproverCount: z.number().int().min(1).nullable().default(null), // グループ承認時の必要人数
  deadlineDays: z.number().int().min(1).max(99).nullable().default(null),
  deadlineAutoAction: DeadlineAutoAction.default('none'),
  remandMode: RemandMode.default('require_reapproval'),
  allowSelfApproval: z.boolean().default(false),
  editableFields: z.array(z.string()).nullable().default(null), // 承認時編集可能フィールド

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
export const EXPENSE_FORM_SCHEMA: z.input<typeof FormSchemaDefinition> = {
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
export const LEAVE_FORM_SCHEMA: z.input<typeof FormSchemaDefinition> = {
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
export const SAMPLE_WORKFLOWS: z.input<typeof CreateWorkflowDefinitionSchema>[] = [
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
