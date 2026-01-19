import 'dotenv/config';
import { initLarkClient, getLarkClient } from '../lark/client.js';

const LARK_APP_ID = process.env.LARK_APP_ID ?? '';
const LARK_APP_SECRET = process.env.LARK_APP_SECRET ?? '';
const LARK_BASE_APP_TOKEN = process.env.LARK_BASE_APP_TOKEN ?? '';

// テーブル定義
const TABLES = [
  {
    name: '組織マスタ',
    fields: [
      { field_name: 'code', type: 1 }, // Text
      { field_name: 'name', type: 1 },
      { field_name: 'level', type: 3 }, // Single Select
      { field_name: 'parent_code', type: 1 },
      { field_name: 'is_active', type: 7 }, // Checkbox
    ],
  },
  {
    name: '役職マスタ',
    fields: [
      { field_name: 'name', type: 1 },
      { field_name: 'level', type: 2 }, // Number
      { field_name: 'is_active', type: 7 },
    ],
  },
  {
    name: '承認ロールマスタ',
    fields: [
      { field_name: 'name', type: 1 },
      { field_name: 'description', type: 1 },
      { field_name: 'is_active', type: 7 },
    ],
  },
  {
    name: 'ユーザー',
    fields: [
      { field_name: 'lark_user_id', type: 1 },
      { field_name: 'name', type: 1 },
      { field_name: 'email', type: 1 },
      { field_name: 'is_active', type: 7 },
    ],
  },
  {
    name: 'ユーザー役職',
    fields: [
      { field_name: 'user_id', type: 1 },
      { field_name: 'organization_code', type: 1 },
      { field_name: 'position_name', type: 1 },
      { field_name: 'is_primary', type: 7 },
      { field_name: 'valid_from', type: 5 }, // Date
      { field_name: 'valid_to', type: 5 },
    ],
  },
  {
    name: 'ユーザー承認ロール',
    fields: [
      { field_name: 'user_id', type: 1 },
      { field_name: 'approval_role_name', type: 1 },
      { field_name: 'target_organization_code', type: 1 },
      { field_name: 'valid_from', type: 5 },
      { field_name: 'valid_to', type: 5 },
    ],
  },
  {
    name: 'ワークフロー定義',
    fields: [
      { field_name: 'name', type: 1 },
      { field_name: 'description', type: 1 },
      { field_name: 'category', type: 1 },
      { field_name: 'is_active', type: 7 },
    ],
  },
  {
    name: '承認ステップ',
    fields: [
      { field_name: 'workflow_id', type: 1 },
      { field_name: 'step_order', type: 2 },
      { field_name: 'step_type', type: 3 }, // Single Select: position, role, specific_user
      { field_name: 'position_name', type: 1 },
      { field_name: 'approval_role_name', type: 1 },
      { field_name: 'specific_user_id', type: 1 },
      { field_name: 'label', type: 1 },
      { field_name: 'is_required', type: 7 },
      { field_name: 'skip_if_same_person', type: 7 },
      { field_name: 'skip_if_vacant', type: 7 },
    ],
  },
  {
    name: '申請',
    fields: [
      { field_name: 'workflow_id', type: 1 },
      { field_name: 'applicant_id', type: 1 },
      { field_name: 'applicant_org_code', type: 1 },
      { field_name: 'title', type: 1 },
      { field_name: 'content', type: 1 }, // JSON as text
      { field_name: 'status', type: 3 }, // draft, pending, approved, rejected, cancelled
      { field_name: 'current_step', type: 2 },
      { field_name: 'submitted_at', type: 5 },
      { field_name: 'completed_at', type: 5 },
    ],
  },
  {
    name: '承認履歴',
    fields: [
      { field_name: 'request_id', type: 1 },
      { field_name: 'step_order', type: 2 },
      { field_name: 'approver_id', type: 1 },
      { field_name: 'action', type: 3 }, // approve, reject, remand, skip
      { field_name: 'comment', type: 1 },
      { field_name: 'skip_reason', type: 3 }, // vacant, same_person, not_required
    ],
  },
];

async function main() {
  console.log('🚀 Lark Base セットアップ開始...\n');

  // 認証確認
  if (!LARK_APP_ID || !LARK_APP_SECRET) {
    console.error('❌ LARK_APP_ID と LARK_APP_SECRET が必要です');
    process.exit(1);
  }

  if (!LARK_BASE_APP_TOKEN) {
    console.error('❌ LARK_BASE_APP_TOKEN が必要です');
    process.exit(1);
  }

  // クライアント初期化
  initLarkClient({
    appId: LARK_APP_ID,
    appSecret: LARK_APP_SECRET,
  });
  console.log('✅ Lark クライアント初期化完了');

  const client = getLarkClient();

  // 既存テーブル一覧を取得
  console.log('\n📋 既存テーブルを確認中...');
  try {
    const tablesRes = await client.bitable.v1.appTable.list({
      path: { app_token: LARK_BASE_APP_TOKEN },
    });

    const existingTables = tablesRes.data?.items ?? [];
    console.log(`   既存テーブル: ${existingTables.length}件`);
    for (const table of existingTables) {
      console.log(`   - ${table.name} (${table.table_id})`);
    }

    const existingNames = new Set(existingTables.map((t) => t.name));

    // テーブル作成
    console.log('\n📝 テーブル作成中...');
    for (const tableDef of TABLES) {
      if (existingNames.has(tableDef.name)) {
        console.log(`   ⏭️  ${tableDef.name} - 既に存在`);
        continue;
      }

      try {
        const createRes = await client.bitable.v1.appTable.create({
          path: { app_token: LARK_BASE_APP_TOKEN },
          data: {
            table: {
              name: tableDef.name,
              default_view_name: 'Grid View',
              fields: tableDef.fields,
            },
          },
        });

        if (createRes.data?.table_id) {
          console.log(`   ✅ ${tableDef.name} - 作成完了 (${createRes.data.table_id})`);
        } else {
          console.log(`   ⚠️  ${tableDef.name} - 作成結果不明`);
        }
      } catch (err) {
        console.log(`   ❌ ${tableDef.name} - エラー: ${(err as Error).message}`);
      }
    }

    console.log('\n✨ セットアップ完了！');
    console.log(`\nLark Base: https://mjp1jov5tu9j.jp.larksuite.com/base/${LARK_BASE_APP_TOKEN}`);
  } catch (err) {
    console.error('❌ エラー:', (err as Error).message);
    process.exit(1);
  }
}

main();
