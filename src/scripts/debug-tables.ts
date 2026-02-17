import dotenv from 'dotenv';
dotenv.config({ override: true });
import { initLarkClient, getLarkClient } from '../lark/client.js';

const LARK_APP_ID = process.env.LARK_APP_ID ?? '';
const LARK_APP_SECRET = process.env.LARK_APP_SECRET ?? '';
const LARK_BASE_APP_TOKEN = process.env.LARK_BASE_APP_TOKEN ?? '';

async function debug() {
  console.log('🔍 テーブル構造デバッグ\n');

  initLarkClient({
    appId: LARK_APP_ID,
    appSecret: LARK_APP_SECRET,
  });

  const client = getLarkClient();

  // テーブル一覧取得
  const tablesRes = await client.bitable.v1.appTable.list({
    path: { app_token: LARK_BASE_APP_TOKEN },
  });

  const tables = tablesRes.data?.items ?? [];

  for (const table of tables) {
    console.log(`\n=== ${table.name} (${table.table_id}) ===`);

    // フィールド一覧取得
    try {
      const fieldsRes = await client.bitable.v1.appTableField.list({
        path: {
          app_token: LARK_BASE_APP_TOKEN,
          table_id: table.table_id!,
        },
      });

      const fields = fieldsRes.data?.items ?? [];
      for (const field of fields) {
        console.log(`  - ${field.field_name} (type: ${field.type})`);
      }
    } catch (err) {
      console.log(`  Error: ${(err as Error).message}`);
    }
  }
}

debug().catch(console.error);
