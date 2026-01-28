/**
 * Lark Base のテーブル一覧を取得
 */
import 'dotenv/config';
import { initLarkClient, getLarkClient } from '../lark/client.js';

const LARK_APP_ID = process.env.LARK_APP_ID ?? '';
const LARK_APP_SECRET = process.env.LARK_APP_SECRET ?? '';
const LARK_BASE_APP_TOKEN = 'MTRGbiJvFaA8eCsQeMBjMu4Lpsc';

async function main() {
  initLarkClient({
    appId: LARK_APP_ID,
    appSecret: LARK_APP_SECRET,
  });

  const client = getLarkClient();

  console.log('=== Lark Base テーブル一覧 ===\n');
  console.log(`App Token: ${LARK_BASE_APP_TOKEN}\n`);

  const response = await client.bitable.v1.appTable.list({
    path: { app_token: LARK_BASE_APP_TOKEN },
  });

  const tables = response.data?.items ?? [];

  for (const table of tables) {
    console.log(`${table.name}: ${table.table_id}`);
  }
}

main().catch(console.error);
