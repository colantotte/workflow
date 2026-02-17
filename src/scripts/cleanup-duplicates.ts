import dotenv from 'dotenv';
dotenv.config({ override: true });
import { initLarkClient, getLarkClient, LarkBaseClient } from '../lark/client.js';

const LARK_APP_ID = process.env.LARK_APP_ID ?? '';
const LARK_APP_SECRET = process.env.LARK_APP_SECRET ?? '';
const LARK_BASE_APP_TOKEN = process.env.LARK_BASE_APP_TOKEN ?? '';

const TABLES = {
  approvalSteps: 'tblHyT4FKo50BG07',
};

async function main() {
  console.log('🧹 重複データ削除開始...\n');

  initLarkClient({
    appId: LARK_APP_ID,
    appSecret: LARK_APP_SECRET,
  });

  const baseClient = new LarkBaseClient({ appToken: LARK_BASE_APP_TOKEN });
  const client = getLarkClient();

  // 承認ステップを取得
  const steps = await baseClient.getAllRecords(TABLES.approvalSteps);
  console.log(`現在のステップ数: ${steps.length}`);

  // workflow_id + step_order でグループ化し、重複を特定
  const seen = new Map<string, string>();
  const duplicates: string[] = [];

  for (const step of steps) {
    const key = `${step.fields.workflow_id}-${step.fields.step_order}`;
    if (seen.has(key)) {
      // 重複なので削除対象に追加
      duplicates.push(step.record_id!);
    } else {
      seen.set(key, step.record_id!);
    }
  }

  console.log(`重複ステップ数: ${duplicates.length}`);

  // 重複を削除
  if (duplicates.length > 0) {
    console.log('重複を削除中...');
    for (const recordId of duplicates) {
      try {
        await client.bitable.v1.appTableRecord.delete({
          path: {
            app_token: LARK_BASE_APP_TOKEN,
            table_id: TABLES.approvalSteps,
            record_id: recordId,
          },
        });
        console.log(`   ✅ ${recordId} 削除`);
      } catch (err) {
        console.log(`   ❌ ${recordId} エラー: ${(err as Error).message}`);
      }
    }
  }

  // 確認
  const remainingSteps = await baseClient.getAllRecords(TABLES.approvalSteps);
  console.log(`\n削除後のステップ数: ${remainingSteps.length}`);
}

main().catch(console.error);
