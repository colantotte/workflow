/**
 * データマイグレーション: 既存の user_id を user_link に移行
 */
import 'dotenv/config';
import { initLarkClient, getLarkClient, LarkBaseClient } from '../lark/client.js';

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

  const baseClient = new LarkBaseClient({ appToken: LARK_BASE_APP_TOKEN });

  console.log('=== データマイグレーション: user_id → user_link ===\n');

  // 1. 全ユーザーを取得（lark_user_id → record_id のマッピング作成）
  console.log('1. ユーザーマッピングを作成中...');
  const users = await baseClient.getAllRecords(TABLES.users);
  const userMap = new Map<string, string>(); // lark_user_id → record_id

  for (const user of users) {
    const larkUserId = String(user.fields.lark_user_id ?? '');
    if (larkUserId && user.record_id) {
      userMap.set(larkUserId, user.record_id);
      console.log(`  ${larkUserId} → ${user.record_id}`);
    }
  }
  console.log(`  合計: ${userMap.size} ユーザー\n`);

  // 2. user_positions のデータを移行
  console.log('2. user_positions のデータを移行中...');
  const userPositions = await baseClient.getAllRecords(TABLES.userPositions);
  let migratedPositions = 0;

  for (const record of userPositions) {
    const oldUserId = String(record.fields.user_id ?? '');
    const userRecordId = userMap.get(oldUserId);

    if (userRecordId && record.record_id) {
      try {
        await baseClient.updateRecord(TABLES.userPositions, record.record_id, {
          user_link: [{ record_ids: [userRecordId] }],
        });
        console.log(`  ${record.record_id}: ${oldUserId} → user_link`);
        migratedPositions++;
      } catch (err) {
        console.error(`  エラー (${record.record_id}):`, err);
      }
    } else {
      console.log(`  スキップ (${record.record_id}): ユーザー "${oldUserId}" が見つかりません`);
    }
  }
  console.log(`  移行完了: ${migratedPositions}/${userPositions.length} レコード\n`);

  // 3. user_approval_roles のデータを移行
  console.log('3. user_approval_roles のデータを移行中...');
  const userRoles = await baseClient.getAllRecords(TABLES.userApprovalRoles);
  let migratedRoles = 0;

  for (const record of userRoles) {
    const oldUserId = String(record.fields.user_id ?? '');
    const userRecordId = userMap.get(oldUserId);

    if (userRecordId && record.record_id) {
      try {
        await baseClient.updateRecord(TABLES.userApprovalRoles, record.record_id, {
          user_link: [{ record_ids: [userRecordId] }],
        });
        console.log(`  ${record.record_id}: ${oldUserId} → user_link`);
        migratedRoles++;
      } catch (err) {
        console.error(`  エラー (${record.record_id}):`, err);
      }
    } else {
      console.log(`  スキップ (${record.record_id}): ユーザー "${oldUserId}" が見つかりません`);
    }
  }
  console.log(`  移行完了: ${migratedRoles}/${userRoles.length} レコード\n`);

  console.log('=== データマイグレーション完了 ===');
  console.log('\n次のステップ:');
  console.log('1. Lark Base でデータを確認');
  console.log('2. 問題なければ古い user_id フィールドを削除');
}

main().catch(console.error);
