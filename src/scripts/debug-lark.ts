import 'dotenv/config';
import { initLarkClient, getLarkClient } from '../lark/client.js';

const LARK_APP_ID = process.env.LARK_APP_ID ?? '';
const LARK_APP_SECRET = process.env.LARK_APP_SECRET ?? '';
const LARK_BASE_APP_TOKEN = process.env.LARK_BASE_APP_TOKEN ?? '';

async function main() {
  console.log('=== 環境変数 ===');
  console.log('LARK_APP_ID:', LARK_APP_ID);
  console.log('LARK_APP_SECRET:', LARK_APP_SECRET ? '***設定済み***' : '未設定');
  console.log('LARK_BASE_APP_TOKEN:', LARK_BASE_APP_TOKEN);
  console.log('');

  if (!LARK_APP_ID || !LARK_APP_SECRET || !LARK_BASE_APP_TOKEN) {
    console.error('❌ 環境変数が不足しています');
    process.exit(1);
  }

  // クライアント初期化
  initLarkClient({
    appId: LARK_APP_ID,
    appSecret: LARK_APP_SECRET,
  });
  console.log('✅ Lark クライアント初期化完了');

  const client = getLarkClient();

  // テーブル一覧取得
  console.log('\n=== テーブル一覧取得 ===');
  console.log(`App Token: ${LARK_BASE_APP_TOKEN}`);

  try {
    const tablesRes = await client.bitable.v1.appTable.list({
      path: { app_token: LARK_BASE_APP_TOKEN },
    });

    console.log('\nAPI Response:');
    console.log(JSON.stringify(tablesRes, null, 2));

    const tables = tablesRes.data?.items ?? [];
    console.log(`\n既存テーブル: ${tables.length}件`);
    for (const table of tables) {
      console.log(`  - ${table.name} (${table.table_id})`);
    }
  } catch (err: unknown) {
    console.error('\n❌ エラー:');
    console.error(err);
  }
}

main();
