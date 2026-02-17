import dotenv from 'dotenv';
dotenv.config({ override: true });
import { initLarkClient, getLarkClient, LarkBaseClient } from '../lark/client.js';

const LARK_APP_ID = process.env.LARK_APP_ID ?? '';
const LARK_APP_SECRET = process.env.LARK_APP_SECRET ?? '';
const LARK_BASE_APP_TOKEN = process.env.LARK_BASE_APP_TOKEN ?? '';

const TABLES = {
  userPositions: 'tblGSAYD0p99ZpEf',
  userApprovalRoles: 'tblbHimZpnz1tKzB',
  workflowDefinitions: 'tbloV9BwBTySxhzp',
  approvalSteps: 'tbls8HxUObebzsFl',
};

// 2024-01-01 00:00:00 UTC のUnixタイムスタンプ（ミリ秒）
const VALID_FROM = new Date('2024-01-01T00:00:00Z').getTime();

// ユーザー役職（兼務パターンを含む）
// テーブルのフィールド名は user_id を使用
const USER_POSITIONS = [
  { user_id: 'user_president', organization_code: 'CORP', position_name: '社長', is_primary: true, valid_from: VALID_FROM },
  { user_id: 'user_sales_director', organization_code: 'SALES', position_name: '本部長', is_primary: true, valid_from: VALID_FROM },
  { user_id: 'user_sales_director', organization_code: 'SALES1', position_name: '部長', is_primary: false, valid_from: VALID_FROM },
  { user_id: 'user_sales_manager', organization_code: 'SALES1-1', position_name: '課長', is_primary: true, valid_from: VALID_FROM },
  { user_id: 'user_sales_leader', organization_code: 'SALES1-1', position_name: '一般', is_primary: true, valid_from: VALID_FROM },
  { user_id: 'user_sales_staff', organization_code: 'SALES1-1', position_name: '一般', is_primary: true, valid_from: VALID_FROM },
  { user_id: 'user_finance_manager', organization_code: 'FINANCE', position_name: '部長', is_primary: true, valid_from: VALID_FROM },
];

// ユーザー承認ロール
const USER_APPROVAL_ROLES = [
  { user_id: 'user_finance_manager', approval_role_name: '経理承認者', target_organization_code: '', valid_from: VALID_FROM },
  { user_id: 'user_president', approval_role_name: '取締役決裁', target_organization_code: '', valid_from: VALID_FROM },
];

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

async function main() {
  console.log('🌱 不足データ登録開始...\n');

  initLarkClient({
    appId: LARK_APP_ID,
    appSecret: LARK_APP_SECRET,
  });
  console.log('✅ Lark クライアント初期化完了');

  const baseClient = new LarkBaseClient({ appToken: LARK_BASE_APP_TOKEN });

  // ユーザー役職を追加
  await createRecords(TABLES.userPositions, USER_POSITIONS, 'ユーザー役職');

  // ユーザー承認ロールを追加
  await createRecords(TABLES.userApprovalRoles, USER_APPROVAL_ROLES, 'ユーザー承認ロール');

  // ワークフロー定義のIDを取得
  console.log('\n📝 ワークフロー定義のID取得中...');
  const workflows = await baseClient.getAllRecords(TABLES.workflowDefinitions);
  const workflowIds = new Map<string, string>();
  for (const wf of workflows) {
    const name = String(wf.fields.name ?? '');
    workflowIds.set(name, wf.record_id!);
    console.log(`   📋 ${name} -> ${wf.record_id}`);
  }

  // 承認ステップを追加
  const approvalSteps = [
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

  await createRecords(TABLES.approvalSteps, approvalSteps, '承認ステップ');

  console.log('\n✨ 不足データ登録完了！');
}

main().catch(console.error);
