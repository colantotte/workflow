import 'dotenv/config';
import { initLarkClient, getLarkClient } from '../lark/client.js';

const LARK_APP_ID = process.env.LARK_APP_ID ?? '';
const LARK_APP_SECRET = process.env.LARK_APP_SECRET ?? '';
const LARK_BASE_APP_TOKEN = process.env.LARK_BASE_APP_TOKEN ?? '';

const TABLES = {
  userPositions: 'tblFGW04ht3CGmYS',
  userApprovalRoles: 'tblOv1swrQozXeYE',
};

async function main() {
  console.log('🔍 デバッグ: レコード挿入テスト\n');

  initLarkClient({
    appId: LARK_APP_ID,
    appSecret: LARK_APP_SECRET,
  });

  const client = getLarkClient();

  // ユーザー役職テーブルにテストレコードを挿入
  console.log('=== ユーザー役職テーブルへの挿入テスト ===');
  try {
    const testRecord = {
      user_id: 'user_sales_staff',
      organization_code: 'SALES1-1',
      position_name: '一般',
      is_primary: true,
      valid_from: '2024-01-01',
    };
    console.log('挿入データ:', JSON.stringify(testRecord, null, 2));

    const result = await client.bitable.v1.appTableRecord.create({
      path: {
        app_token: LARK_BASE_APP_TOKEN,
        table_id: TABLES.userPositions,
      },
      data: { fields: testRecord },
    });

    console.log('結果:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.log('エラー:', err);
  }

  // レコード取得テスト
  console.log('\n=== ユーザー役職テーブルからの取得テスト ===');
  try {
    const result = await client.bitable.v1.appTableRecord.list({
      path: {
        app_token: LARK_BASE_APP_TOKEN,
        table_id: TABLES.userPositions,
      },
      params: {
        page_size: 10,
      },
    });

    console.log('取得結果:', JSON.stringify(result.data, null, 2));
  } catch (err) {
    console.log('エラー:', err);
  }
}

main().catch(console.error);
