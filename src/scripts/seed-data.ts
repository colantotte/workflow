import 'dotenv/config';
import { initLarkClient, getLarkClient } from '../lark/client.js';

const LARK_APP_ID = process.env.LARK_APP_ID ?? '';
const LARK_APP_SECRET = process.env.LARK_APP_SECRET ?? '';
const LARK_BASE_APP_TOKEN = process.env.LARK_BASE_APP_TOKEN ?? '';

// テーブルID
const TABLES = {
  organizations: 'tblCnyU5rDlwsFCd',
  positions: 'tblvNSExDwSQLTl4',
  approvalRoles: 'tblexuWyCZJQVsUt',
  users: 'tblKjUDl9ysBlZot',
  userPositions: 'tblGSAYD0p99ZpEf',
  userApprovalRoles: 'tblbHimZpnz1tKzB',
  workflowDefinitions: 'tbloV9BwBTySxhzp',
  approvalSteps: 'tbls8HxUObebzsFl',
};

// サンプルデータ
const ORGANIZATIONS = [
  { code: 'CORP', name: '本社', level: 'company', parent_code: '', is_active: true },
  { code: 'SALES', name: '営業本部', level: 'division', parent_code: 'CORP', is_active: true },
  { code: 'SALES1', name: '営業1部', level: 'department', parent_code: 'SALES', is_active: true },
  { code: 'SALES1-1', name: '営業1課', level: 'section', parent_code: 'SALES1', is_active: true },
  { code: 'ADMIN', name: '管理本部', level: 'division', parent_code: 'CORP', is_active: true },
  { code: 'FINANCE', name: '経理部', level: 'department', parent_code: 'ADMIN', is_active: true },
  { code: 'HR', name: '人事部', level: 'department', parent_code: 'ADMIN', is_active: true },
];

const POSITIONS = [
  { name: '社長', level: 1, is_active: true },
  { name: '本部長', level: 2, is_active: true },
  { name: '部長', level: 3, is_active: true },
  { name: '課長', level: 4, is_active: true },
  { name: '一般', level: 5, is_active: true },
];

const APPROVAL_ROLES = [
  { name: '経理承認者', description: '経費精算・予算執行の承認', is_active: true },
  { name: '取締役決裁', description: '取締役会決裁事項の承認', is_active: true },
  { name: '人事承認者', description: '人事関連申請の承認', is_active: true },
];

const USERS = [
  { lark_user_id: 'user_president', name: '山田太郎', email: 'yamada@example.com', is_active: true },
  { lark_user_id: 'user_sales_director', name: '鈴木一郎', email: 'suzuki@example.com', is_active: true },
  { lark_user_id: 'user_sales_manager', name: '佐藤花子', email: 'sato@example.com', is_active: true },
  { lark_user_id: 'user_sales_leader', name: '田中次郎', email: 'tanaka@example.com', is_active: true },
  { lark_user_id: 'user_sales_staff', name: '高橋三郎', email: 'takahashi@example.com', is_active: true },
  { lark_user_id: 'user_finance_manager', name: '伊藤美咲', email: 'ito@example.com', is_active: true },
];

// ユーザー役職（兼務パターンを含む）
// テーブルのフィールド名は user_id を使用
const USER_POSITIONS = [
  // 山田社長
  { user_id: 'user_president', organization_code: 'CORP', position_name: '社長', is_primary: true, valid_from: '2024-01-01' },
  // 鈴木 営業本部長（部長兼務）
  { user_id: 'user_sales_director', organization_code: 'SALES', position_name: '本部長', is_primary: true, valid_from: '2024-01-01' },
  { user_id: 'user_sales_director', organization_code: 'SALES1', position_name: '部長', is_primary: false, valid_from: '2024-01-01' }, // 兼務
  // 佐藤 営業1部 課長（部長代理）
  { user_id: 'user_sales_manager', organization_code: 'SALES1-1', position_name: '課長', is_primary: true, valid_from: '2024-01-01' },
  // 田中 営業1課 一般
  { user_id: 'user_sales_leader', organization_code: 'SALES1-1', position_name: '一般', is_primary: true, valid_from: '2024-01-01' },
  // 高橋 営業1課 一般（申請者）
  { user_id: 'user_sales_staff', organization_code: 'SALES1-1', position_name: '一般', is_primary: true, valid_from: '2024-01-01' },
  // 伊藤 経理部 部長
  { user_id: 'user_finance_manager', organization_code: 'FINANCE', position_name: '部長', is_primary: true, valid_from: '2024-01-01' },
];

// ユーザー承認ロール
// テーブルのフィールド名は user_id を使用
const USER_APPROVAL_ROLES = [
  // 伊藤：経理承認者（全組織対象）
  { user_id: 'user_finance_manager', approval_role_name: '経理承認者', target_organization_code: '', valid_from: '2024-01-01' },
  // 山田社長：取締役決裁
  { user_id: 'user_president', approval_role_name: '取締役決裁', target_organization_code: '', valid_from: '2024-01-01' },
];

// 経費精算フォーム
const EXPENSE_FORM_SCHEMA = {
  fields: [
    { name: 'amount', label: '金額', type: 'number', required: true, placeholder: '金額を入力', validation: { min: 1 } },
    { name: 'expenseDate', label: '支出日', type: 'date', required: true },
    { name: 'category', label: '経費区分', type: 'select', required: true, options: [
      { value: 'travel', label: '交通費' },
      { value: 'entertainment', label: '交際費' },
      { value: 'supplies', label: '消耗品費' },
      { value: 'communication', label: '通信費' },
      { value: 'other', label: 'その他' },
    ]},
    { name: 'description', label: '内容・目的', type: 'textarea', required: true, placeholder: '経費の内容と目的を入力' },
    { name: 'receipt', label: '領収書添付', type: 'checkbox', required: false },
  ],
};

// ワークフロー定義
const WORKFLOWS = [
  { name: '経費精算（10万円未満）', description: '10万円未満の経費精算', category: '経費精算', form_schema: JSON.stringify(EXPENSE_FORM_SCHEMA), is_active: true },
  { name: '経費精算（10万円以上）', description: '10万円以上の経費精算（取締役決裁）', category: '経費精算', form_schema: JSON.stringify(EXPENSE_FORM_SCHEMA), is_active: true },
];

// 承認ステップ（workflow_nameはプレースホルダー、実行時にworkflow_idに変換）
function createApprovalSteps(workflowIds: Map<string, string>) {
  return [
    // 経費精算（10万円未満）: 課長 → 部長 → 経理承認者
    { workflow_id: workflowIds.get('経費精算（10万円未満）'), step_order: 1, step_type: 'position', position_name: '課長', label: '課長承認', is_required: true, skip_if_same_person: true, skip_if_vacant: true },
    { workflow_id: workflowIds.get('経費精算（10万円未満）'), step_order: 2, step_type: 'position', position_name: '部長', label: '部長承認', is_required: true, skip_if_same_person: true, skip_if_vacant: true },
    { workflow_id: workflowIds.get('経費精算（10万円未満）'), step_order: 3, step_type: 'role', approval_role_name: '経理承認者', label: '経理承認', is_required: true, skip_if_same_person: true, skip_if_vacant: false },

    // 経費精算（10万円以上）: 課長 → 部長 → 経理承認者 → 取締役決裁
    { workflow_id: workflowIds.get('経費精算（10万円以上）'), step_order: 1, step_type: 'position', position_name: '課長', label: '課長承認', is_required: true, skip_if_same_person: true, skip_if_vacant: true },
    { workflow_id: workflowIds.get('経費精算（10万円以上）'), step_order: 2, step_type: 'position', position_name: '部長', label: '部長承認', is_required: true, skip_if_same_person: true, skip_if_vacant: true },
    { workflow_id: workflowIds.get('経費精算（10万円以上）'), step_order: 3, step_type: 'role', approval_role_name: '経理承認者', label: '経理承認', is_required: true, skip_if_same_person: true, skip_if_vacant: false },
    { workflow_id: workflowIds.get('経費精算（10万円以上）'), step_order: 4, step_type: 'role', approval_role_name: '取締役決裁', label: '取締役決裁', is_required: true, skip_if_same_person: true, skip_if_vacant: false },
  ];
}

async function createRecords(tableId: string, records: Record<string, unknown>[], tableName: string) {
  const client = getLarkClient();

  console.log(`\n📝 ${tableName} を登録中...`);

  for (const record of records) {
    try {
      await client.bitable.v1.appTableRecord.create({
        path: {
          app_token: LARK_BASE_APP_TOKEN,
          table_id: tableId,
        },
        data: { fields: record as Record<string, string | number | boolean> },
      });
      console.log(`   ✅ ${JSON.stringify(record).substring(0, 60)}...`);
    } catch (err) {
      console.log(`   ❌ エラー: ${(err as Error).message}`);
    }
  }
}

async function createWorkflowsAndGetIds(): Promise<Map<string, string>> {
  const client = getLarkClient();
  const workflowIds = new Map<string, string>();

  console.log(`\n📝 ワークフロー定義 を登録中...`);

  for (const workflow of WORKFLOWS) {
    try {
      const result = await client.bitable.v1.appTableRecord.create({
        path: {
          app_token: LARK_BASE_APP_TOKEN,
          table_id: TABLES.workflowDefinitions,
        },
        data: { fields: workflow as Record<string, string | number | boolean> },
      });
      const recordId = result.data?.record?.record_id;
      if (recordId) {
        workflowIds.set(workflow.name, recordId);
        console.log(`   ✅ ${workflow.name} (ID: ${recordId})`);
      }
    } catch (err) {
      console.log(`   ❌ エラー: ${(err as Error).message}`);
    }
  }

  return workflowIds;
}

async function main() {
  console.log('🌱 サンプルデータ登録開始...\n');

  // クライアント初期化
  initLarkClient({
    appId: LARK_APP_ID,
    appSecret: LARK_APP_SECRET,
  });
  console.log('✅ Lark クライアント初期化完了');

  // 各テーブルにデータ登録（既存データがある場合はスキップ）
  await createRecords(TABLES.organizations, ORGANIZATIONS, '組織マスタ');
  await createRecords(TABLES.positions, POSITIONS, '役職マスタ');
  await createRecords(TABLES.approvalRoles, APPROVAL_ROLES, '承認ロールマスタ');
  await createRecords(TABLES.users, USERS, 'ユーザー');
  await createRecords(TABLES.userPositions, USER_POSITIONS, 'ユーザー役職');
  await createRecords(TABLES.userApprovalRoles, USER_APPROVAL_ROLES, 'ユーザー承認ロール');

  // ワークフローを作成してIDを取得
  const workflowIds = await createWorkflowsAndGetIds();

  // 承認ステップを作成（workflow_idを使用）
  const approvalSteps = createApprovalSteps(workflowIds);
  await createRecords(TABLES.approvalSteps, approvalSteps, '承認ステップ');

  console.log('\n✨ サンプルデータ登録完了！');
  console.log('\n=== 登録した組織構造 ===');
  console.log(`
本社 (CORP)
├── 営業本部 (SALES) ← 鈴木（本部長）
│   └── 営業1部 (SALES1) ← 鈴木（部長兼務）
│       └── 営業1課 (SALES1-1) ← 佐藤（課長）、田中・高橋（一般）
└── 管理本部 (ADMIN)
    ├── 経理部 (FINANCE) ← 伊藤（部長）※経理承認者
    └── 人事部 (HR)
`);

  console.log('=== スキップロジックのテストシナリオ ===');
  console.log(`
【シナリオ1: 兼務スキップ】
申請者: 高橋（営業1課 一般）
承認ルート: 課長(佐藤) → 部長(鈴木) → 経理承認者(伊藤)
※ 鈴木が部長を兼務しているため、本部長承認がスキップされる

【シナリオ2: 空席スキップ】
営業1課に課長がいない場合、部長（鈴木）にエスカレーション
`);
}

main().catch(console.error);
