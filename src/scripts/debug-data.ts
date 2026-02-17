import dotenv from 'dotenv';
dotenv.config({ override: true });
import { initLarkClient, LarkBaseClient } from '../lark/client.js';

const LARK_APP_ID = process.env.LARK_APP_ID ?? '';
const LARK_APP_SECRET = process.env.LARK_APP_SECRET ?? '';
const LARK_BASE_APP_TOKEN = process.env.LARK_BASE_APP_TOKEN ?? '';

const TABLES = {
  organizations: 'tblfZBzTy2zeZ4qd',
  positions: 'tblGwXV8PjL0ktRJ',
  approvalRoles: 'tblaniU0n3e5rt5z',
  users: 'tblOldYxIw0Yjix6',
  userPositions: 'tblFGW04ht3CGmYS',
  userApprovalRoles: 'tblOv1swrQozXeYE',
  workflowDefinitions: 'tblGiasaWTLXNz8X',
  approvalSteps: 'tblHyT4FKo50BG07',
};

async function debug() {
  console.log('🔍 データ構造デバッグ\n');

  initLarkClient({
    appId: LARK_APP_ID,
    appSecret: LARK_APP_SECRET,
  });

  const baseClient = new LarkBaseClient({ appToken: LARK_BASE_APP_TOKEN });

  // ユーザー役職テーブルの構造を確認
  console.log('=== ユーザー役職テーブル ===');
  const userPositions = await baseClient.getAllRecords(TABLES.userPositions);
  console.log(`件数: ${userPositions.length}`);
  if (userPositions.length > 0) {
    console.log('サンプルレコード:', JSON.stringify(userPositions[0], null, 2));
  }

  // ユーザー承認ロールテーブルの構造を確認
  console.log('\n=== ユーザー承認ロールテーブル ===');
  const userApprovalRoles = await baseClient.getAllRecords(TABLES.userApprovalRoles);
  console.log(`件数: ${userApprovalRoles.length}`);
  if (userApprovalRoles.length > 0) {
    console.log('サンプルレコード:', JSON.stringify(userApprovalRoles[0], null, 2));
  }

  // ユーザーテーブルの構造を確認
  console.log('\n=== ユーザーテーブル ===');
  const users = await baseClient.getAllRecords(TABLES.users);
  console.log(`件数: ${users.length}`);
  if (users.length > 0) {
    console.log('サンプルレコード:', JSON.stringify(users[0], null, 2));
  }

  // 承認ステップテーブルの構造を確認
  console.log('\n=== 承認ステップテーブル ===');
  const steps = await baseClient.getAllRecords(TABLES.approvalSteps);
  console.log(`件数: ${steps.length}`);
  if (steps.length > 0) {
    console.log('サンプルレコード:', JSON.stringify(steps[0], null, 2));
  }
}

debug().catch(console.error);
