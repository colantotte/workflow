import dotenv from 'dotenv';
dotenv.config({ override: true });
import { initLarkClient } from '../lark/client.js';
import { getRepository } from '../repositories/lark-base.repository.js';
import type { RouteStep } from '../models/index.js';

const LARK_APP_ID = process.env.LARK_APP_ID ?? '';
const LARK_APP_SECRET = process.env.LARK_APP_SECRET ?? '';

async function main() {
  console.log('🚀 経路マスタ シード開始...\n');

  if (!LARK_APP_ID || !LARK_APP_SECRET) {
    console.error('❌ LARK_APP_ID と LARK_APP_SECRET が必要です');
    process.exit(1);
  }

  initLarkClient({ appId: LARK_APP_ID, appSecret: LARK_APP_SECRET });
  console.log('✅ Lark クライアント初期化完了');

  const repo = getRepository();

  // 既存の経路マスタを確認
  let existingMasters;
  try {
    existingMasters = await repo.getRouteMasters();
  } catch {
    existingMasters = [];
  }

  if (existingMasters.length > 0) {
    console.log(`\n⚠️  既に ${existingMasters.length} 件の経路マスタが存在します。`);
    console.log('   重複防止のため、スキップします。');
    console.log('   再投入する場合は、Lark Base で経路マスタ・経路ステップを手動削除してください。');
    return;
  }

  // 全ワークフローを取得
  const workflows = await repo.listWorkflows();
  console.log(`\n📋 ワークフロー: ${workflows.length} 件`);

  let masterCount = 0;
  let stepCount = 0;

  for (const wf of workflows) {
    // 承認ステップを取得
    const steps = await repo.getApprovalSteps(wf.id);
    if (steps.length === 0) {
      console.log(`   ⏭️  ${wf.name} - 承認ステップなし、スキップ`);
      continue;
    }

    // route_master を作成
    const master = await repo.createRouteMaster({
      name: `${wf.name}（基本経路）`,
      description: `${wf.name} の標準承認経路`,
      workflowId: wf.id,
      routeType: 'basic',
      priority: 1,
      targetPositionId: null,
      targetDepartmentId: null,
      targetUserId: null,
      isStandard: true,
      isActive: true,
      conditions: null,
    });
    masterCount++;

    // 各 approval_step を route_step としてコピー
    for (const step of steps) {
      await repo.createRouteStep({
        routeMasterId: master.id,
        stepOrder: step.stepOrder,
        stepType: step.stepType,
        positionId: step.positionId,
        approvalRoleId: step.approvalRoleId,
        specificUserId: step.specificUserId,
        label: step.label,
        isRequired: step.isRequired,
        skipIfSamePerson: step.skipIfSamePerson,
        skipIfVacant: step.skipIfVacant,
        conditions: step.conditions as RouteStep['conditions'],
        stepRoleType: step.stepRoleType ?? 'approver',
        multiApproverMode: step.multiApproverMode ?? 'single',
        requiredApproverCount: step.requiredApproverCount ?? null,
        deadlineDays: step.deadlineDays ?? null,
        deadlineAutoAction: step.deadlineAutoAction ?? 'none',
        remandMode: step.remandMode ?? 'require_reapproval',
        allowSelfApproval: step.allowSelfApproval ?? false,
        editableFields: step.editableFields ?? null,
      });
      stepCount++;
    }

    console.log(`   ✅ ${wf.name} → 経路マスタ作成 (${steps.length} ステップ)`);
  }

  console.log(`\n✨ シード完了！`);
  console.log(`   経路マスタ: ${masterCount} 件`);
  console.log(`   経路ステップ: ${stepCount} 件`);
}

main().catch((err) => {
  console.error('❌ エラー:', err);
  process.exit(1);
});
