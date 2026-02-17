import dotenv from 'dotenv';
dotenv.config({ override: true });
import { initLarkClient } from '../lark/client.js';

const client = initLarkClient({
  appId: process.env.LARK_APP_ID!,
  appSecret: process.env.LARK_APP_SECRET!,
});

async function main() {
  const appToken = process.env.LARK_BASE_APP_TOKEN!;
  const usersTable = process.env.LARK_TABLE_USERS!;

  // ユーザーのroleを設定
  const roleMap: Record<string, string> = {
    'user_president': 'admin',
    'user_sales_director': 'manager',
    'user_sales_manager': 'manager',
    'user_sales_leader': 'user',
    'user_sales_staff': 'user',
    'user_finance_manager': 'manager',
    'f9ebgf54': 'admin',
  };

  const usersResp = await client.bitable.v1.appTableRecord.list({
    path: { app_token: appToken, table_id: usersTable },
    params: { page_size: 100 },
  });

  console.log('Updating user roles...');
  for (const r of usersResp.data?.items ?? []) {
    const f = (r as any).fields;
    const recordId = (r as any).record_id;
    const larkUserId = String(f.lark_user_id ?? '');
    const currentRole = f.role;
    const targetRole = roleMap[larkUserId] || 'user';

    if (currentRole !== targetRole) {
      await client.bitable.v1.appTableRecord.update({
        path: { app_token: appToken, table_id: usersTable, record_id: recordId },
        data: { fields: { role: targetRole } },
      });
      console.log(`  ${f.name}: ${currentRole} -> ${targetRole}`);
    } else {
      console.log(`  ${f.name}: ${currentRole} (OK)`);
    }
  }
  console.log('Done');
}

main().catch(console.error);
