/**
 * マイグレーションスクリプト: user_positions と user_approval_roles のユーザー参照をリンクフィールドに変更
 */
import 'dotenv/config';
import { initLarkClient, getLarkClient } from '../lark/client.js';

const LARK_APP_ID = process.env.LARK_APP_ID ?? '';
const LARK_APP_SECRET = process.env.LARK_APP_SECRET ?? '';
const LARK_BASE_APP_TOKEN = process.env.LARK_BASE_APP_TOKEN ?? '';

const TABLES = {
  users: process.env.LARK_TABLE_USERS ?? 'tblKjUDl9ysBlZot',
  userPositions: process.env.LARK_TABLE_USER_POSITIONS ?? 'tblGSAYD0p99ZpEf',
  userApprovalRoles: process.env.LARK_TABLE_USER_APPROVAL_ROLES ?? 'tblbHimZpnz1tKzB',
};

async function main() {
  // Larkクライアント初期化
  initLarkClient({
    appId: LARK_APP_ID,
    appSecret: LARK_APP_SECRET,
  });

  const client = getLarkClient();

  console.log('=== Lark Base フィールドマイグレーション ===\n');

  // 1. 現在のフィールド一覧を取得
  console.log('1. 現在のフィールド構成を確認中...\n');

  for (const [tableName, tableId] of Object.entries(TABLES)) {
    console.log(`--- ${tableName} (${tableId}) ---`);
    try {
      const response = await client.bitable.v1.appTableField.list({
        path: {
          app_token: LARK_BASE_APP_TOKEN,
          table_id: tableId,
        },
      });

      const fields = response.data?.items ?? [];
      for (const field of fields) {
        console.log(`  ${field.field_name}: ${field.type} (${field.field_id})`);
      }
      console.log('');
    } catch (err) {
      console.error(`  エラー: ${err}`);
    }
  }

  // 2. user_positions テーブルにリンクフィールドを追加
  console.log('2. user_positions テーブルにリンクフィールドを追加...');
  try {
    const response = await client.bitable.v1.appTableField.create({
      path: {
        app_token: LARK_BASE_APP_TOKEN,
        table_id: TABLES.userPositions,
      },
      data: {
        field_name: 'user_link',
        type: 18, // 18 = Link field type
        property: {
          table_id: TABLES.users,
        } as Record<string, unknown>,
      },
    });
    console.log(`  成功: field_id = ${response.data?.field?.field_id}`);
  } catch (err: unknown) {
    const error = err as { response?: { data?: unknown }; message?: string };
    console.error(`  エラー:`, error.response?.data || error.message);
  }

  // 3. user_approval_roles テーブルにリンクフィールドを追加
  console.log('\n3. user_approval_roles テーブルにリンクフィールドを追加...');
  try {
    const response = await client.bitable.v1.appTableField.create({
      path: {
        app_token: LARK_BASE_APP_TOKEN,
        table_id: TABLES.userApprovalRoles,
      },
      data: {
        field_name: 'user_link',
        type: 18, // 18 = Link field type
        property: {
          table_id: TABLES.users,
        } as Record<string, unknown>,
      },
    });
    console.log(`  成功: field_id = ${response.data?.field?.field_id}`);
  } catch (err: unknown) {
    const error = err as { response?: { data?: unknown }; message?: string };
    console.error(`  エラー:`, error.response?.data || error.message);
  }

  console.log('\n=== マイグレーション完了 ===');
  console.log('\n次のステップ:');
  console.log('1. Lark Base で各テーブルを開き、既存データの user_link フィールドを設定');
  console.log('2. 古い user_id フィールドは手動で削除（データ移行後）');
  console.log('3. コードを更新してリンクフィールドを使用するように変更');
}

main().catch(console.error);
