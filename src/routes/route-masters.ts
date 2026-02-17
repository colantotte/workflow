import { Hono } from 'hono';
import { parse } from 'csv-parse/sync';
import { getRepository } from '../repositories/lark-base.repository.js';
import type { RouteMaster, RouteStep } from '../models/index.js';

// CSV用のラベルマッピング
const ROUTE_TYPE_LABELS: Record<string, string> = {
  basic: '基本', by_position: '役職別', by_department: '部署別', by_individual: '個人別',
};
const ROUTE_TYPE_REVERSE: Record<string, string> = {
  '基本': 'basic', '役職別': 'by_position', '部署別': 'by_department', '個人別': 'by_individual',
};
const STEP_ROLE_LABELS: Record<string, string> = {
  approver: '承認者', final_approver: '決裁者', handler: '業務担当者', notifier: '通知',
};
const STEP_ROLE_REVERSE: Record<string, string> = {
  '承認者': 'approver', '決裁者': 'final_approver', '業務担当者': 'handler', '通知': 'notifier',
};
const APPROVER_MODE_LABELS: Record<string, string> = {
  single: '順次', all: '全員', group: 'グループ', notify: '通知のみ',
};
const APPROVER_MODE_REVERSE: Record<string, string> = {
  '順次': 'single', '全員': 'all', 'グループ': 'group', '通知のみ': 'notify',
};
const DEADLINE_ACTION_LABELS: Record<string, string> = {
  none: '', auto_approve: '自動承認', auto_reject: '自動却下',
};
const DEADLINE_ACTION_REVERSE: Record<string, string> = {
  '': 'none', '自動承認': 'auto_approve', '自動却下': 'auto_reject',
};

// CSVのフィールドをエスケープ
function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

// 一括CSVのヘッダー
const BULK_CSV_HEADERS = [
  '経路名', '説明', 'ワークフロー名', '経路タイプ', '優先度', '標準経路',
  'ステップ順', 'ステップ名', '役割タイプ', '承認方法', '必要人数',
  '必須', '期限日数', '期限後動作',
];

const routeMasters = new Hono();

// 経路マスタ一覧
routeMasters.get('/', async (c) => {
  const repo = getRepository();
  const workflowId = c.req.query('workflowId');
  try {
    const masters = await repo.getRouteMasters(workflowId);
    return c.json({ routeMasters: masters });
  } catch {
    // テーブルが未作成の場合
    return c.json({ routeMasters: [] });
  }
});

// ==================== 一括CSV管理（/:idより前に定義） ====================

// 一括CSVテンプレートダウンロード
routeMasters.get('/export-all/template', async (c) => {
  const sampleRows = [
    ['社長決裁（基本）', '基本的な社長決裁経路', '稟議書', '基本', '50', 'はい', '1', '課長承認', '承認者', '順次', '1', 'はい', '3', ''],
    ['', '', '', '', '', '', '2', '部長承認', '承認者', '順次', '1', 'はい', '3', ''],
    ['', '', '', '', '', '', '3', '社長決裁', '決裁者', '順次', '1', 'はい', '5', ''],
    ['部長決裁', '部長までの決裁経路', '稟議書', '基本', '40', 'いいえ', '1', '課長承認', '承認者', '順次', '1', 'はい', '3', ''],
    ['', '', '', '', '', '', '2', '部長決裁', '決裁者', '順次', '1', 'はい', '3', ''],
  ];

  const bom = '\uFEFF';
  const csv = bom + [
    BULK_CSV_HEADERS.map(csvEscape).join(','),
    ...sampleRows.map(row => row.map(csvEscape).join(',')),
  ].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="route-masters-template.csv"',
    },
  });
});

// 一括CSVエクスポート（全経路マスタ + ステップ）
routeMasters.get('/export-all', async (c) => {
  const repo = getRepository();
  const workflowId = c.req.query('workflowId');
  let masters: RouteMaster[];
  try {
    masters = await repo.getRouteMasters(workflowId);
  } catch {
    // テーブルが未作成の場合は空データで返す
    masters = [];
  }

  // ワークフロー名のマップを構築
  const workflows = await repo.listWorkflows();
  const wfMap = new Map(workflows.map(w => [w.id, w.name]));

  // 全ステップを一括取得してマスタID別にグループ化（N+1回避）
  let allSteps: RouteStep[] = [];
  try {
    allSteps = await repo.getAllRouteSteps();
  } catch { /* ignore */ }
  const stepsByMaster = new Map<string, RouteStep[]>();
  for (const step of allSteps) {
    const list = stepsByMaster.get(step.routeMasterId) ?? [];
    list.push(step);
    stepsByMaster.set(step.routeMasterId, list);
  }

  const rows: string[][] = [];

  for (const master of masters) {
    const wfName = wfMap.get(master.workflowId) || master.workflowId;
    const steps = (stepsByMaster.get(master.id) ?? []).sort((a, b) => a.stepOrder - b.stepOrder);

    if (steps.length === 0) {
      rows.push([
        master.name, master.description || '', wfName,
        ROUTE_TYPE_LABELS[master.routeType] || master.routeType,
        String(master.priority), master.isStandard ? 'はい' : 'いいえ',
        '', '', '', '', '', '', '', '',
      ]);
    } else {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const isFirstStep = i === 0;
        rows.push([
          isFirstStep ? master.name : '',
          isFirstStep ? (master.description || '') : '',
          isFirstStep ? wfName : '',
          isFirstStep ? (ROUTE_TYPE_LABELS[master.routeType] || master.routeType) : '',
          isFirstStep ? String(master.priority) : '',
          isFirstStep ? (master.isStandard ? 'はい' : 'いいえ') : '',
          String(step.stepOrder),
          step.label || '',
          STEP_ROLE_LABELS[step.stepRoleType] || step.stepRoleType,
          APPROVER_MODE_LABELS[step.multiApproverMode] || step.multiApproverMode,
          step.requiredApproverCount != null ? String(step.requiredApproverCount) : '1',
          step.isRequired ? 'はい' : 'いいえ',
          step.deadlineDays != null ? String(step.deadlineDays) : '',
          DEADLINE_ACTION_LABELS[step.deadlineAutoAction] || '',
        ]);
      }
    }
  }

  const bom = '\uFEFF';
  const csv = bom + [
    BULK_CSV_HEADERS.map(csvEscape).join(','),
    ...rows.map(row => row.map(csvEscape).join(',')),
  ].join('\n');

  const filename = workflowId ? `route-masters-${workflowId}.csv` : 'route-masters-all.csv';
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});

// 一括CSVインポート（経路マスタ + ステップ）
routeMasters.post('/import-bulk', async (c) => {
  const body = await c.req.json();
  const { csvData, mode } = body as { csvData: string; mode?: 'replace' | 'merge' };
  if (!csvData) return c.json({ error: 'csvDataが必要です' }, 400);

  let records: Record<string, string>[];
  try {
    records = parse(csvData, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'CSVパースに失敗しました';
    return c.json({ error: `CSVパースエラー: ${msg}` }, 400);
  }

  if (records.length === 0) {
    return c.json({ error: 'データ行がありません' }, 400);
  }

  const repo = getRepository();

  const workflows = await repo.listWorkflows();
  const wfNameMap = new Map(workflows.map(w => [w.name, w.id]));

  interface RouteGroup {
    name: string;
    description: string;
    workflowName: string;
    routeType: string;
    priority: number;
    isStandard: boolean;
    steps: Array<{
      stepOrder: number;
      label: string;
      stepRoleType: string;
      multiApproverMode: string;
      requiredApproverCount: number | null;
      isRequired: boolean;
      deadlineDays: number | null;
      deadlineAutoAction: string;
    }>;
    rowNumber: number;
  }

  const groups: RouteGroup[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNum = i + 2;

    const routeName = row['経路名']?.trim();
    if (routeName) {
      const wfName = row['ワークフロー名']?.trim();
      if (!wfName) {
        errors.push({ row: rowNum, message: 'ワークフロー名が必要です' });
        continue;
      }
      if (!wfNameMap.has(wfName)) {
        errors.push({ row: rowNum, message: `ワークフロー「${wfName}」が見つかりません` });
        continue;
      }

      const routeTypeJa = row['経路タイプ']?.trim() || '基本';
      const routeType = ROUTE_TYPE_REVERSE[routeTypeJa] || routeTypeJa;

      groups.push({
        name: routeName,
        description: row['説明']?.trim() || '',
        workflowName: wfName,
        routeType,
        priority: parseInt(row['優先度'], 10) || 50,
        isStandard: row['標準経路']?.trim() === 'はい',
        steps: [],
        rowNumber: rowNum,
      });
    }

    const stepOrder = row['ステップ順']?.trim();
    if (stepOrder && groups.length > 0) {
      const currentGroup = groups[groups.length - 1];
      const roleTypeJa = row['役割タイプ']?.trim() || '承認者';
      const modeJa = row['承認方法']?.trim() || '順次';
      const deadlineActionJa = row['期限後動作']?.trim() || '';

      currentGroup.steps.push({
        stepOrder: parseInt(stepOrder, 10),
        label: row['ステップ名']?.trim() || '',
        stepRoleType: STEP_ROLE_REVERSE[roleTypeJa] || roleTypeJa,
        multiApproverMode: APPROVER_MODE_REVERSE[modeJa] || modeJa,
        requiredApproverCount: row['必要人数']?.trim() ? parseInt(row['必要人数'], 10) : null,
        isRequired: row['必須']?.trim() !== 'いいえ',
        deadlineDays: row['期限日数']?.trim() ? parseInt(row['期限日数'], 10) : null,
        deadlineAutoAction: DEADLINE_ACTION_REVERSE[deadlineActionJa] || 'none',
      });
    }
  }

  if (errors.length > 0 && groups.length === 0) {
    return c.json({ success: false, errors, created: 0, updated: 0, skipped: 0 }, 400);
  }

  const existingMasters = await repo.getRouteMasters();
  const existingMap = new Map(
    existingMasters.map(m => [`${m.name}::${m.workflowId}`, m])
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const group of groups) {
    const workflowId = wfNameMap.get(group.workflowName);
    if (!workflowId) {
      errors.push({ row: group.rowNumber, message: `ワークフロー「${group.workflowName}」が見つかりません` });
      skipped++;
      continue;
    }

    const key = `${group.name}::${workflowId}`;
    const existing = existingMap.get(key);

    let masterId: string;

    if (existing && mode !== 'replace') {
      await repo.updateRouteMaster(existing.id, {
        description: group.description,
        routeType: group.routeType as RouteMaster['routeType'],
        priority: group.priority,
        isStandard: group.isStandard,
      });
      masterId = existing.id;

      const existingSteps = await repo.getRouteSteps(masterId);
      for (const step of existingSteps) {
        await repo.deleteRouteStep(step.id);
      }
      updated++;
    } else {
      if (existing && mode === 'replace') {
        await repo.deleteRouteMaster(existing.id);
      }
      const newMaster = await repo.createRouteMaster({
        name: group.name,
        description: group.description,
        workflowId,
        routeType: group.routeType as RouteMaster['routeType'],
        priority: group.priority,
        isStandard: group.isStandard,
        isActive: true,
        targetPositionId: null,
        targetDepartmentId: null,
        targetUserId: null,
        conditions: null,
      });
      masterId = newMaster.id;
      created++;
    }

    for (const step of group.steps) {
      await repo.createRouteStep({
        routeMasterId: masterId,
        stepOrder: step.stepOrder,
        stepType: 'role',
        positionId: null,
        approvalRoleId: null,
        specificUserId: null,
        label: step.label,
        isRequired: step.isRequired,
        skipIfSamePerson: true,
        skipIfVacant: true,
        conditions: null,
        stepRoleType: step.stepRoleType as RouteStep['stepRoleType'],
        multiApproverMode: step.multiApproverMode as RouteStep['multiApproverMode'],
        requiredApproverCount: step.requiredApproverCount,
        deadlineDays: step.deadlineDays,
        deadlineAutoAction: step.deadlineAutoAction as RouteStep['deadlineAutoAction'],
        remandMode: 'require_reapproval',
        allowSelfApproval: false,
        editableFields: null,
      });
    }
  }

  return c.json({
    success: errors.length === 0,
    created,
    updated,
    skipped,
    totalRoutes: groups.length,
    totalSteps: groups.reduce((sum, g) => sum + g.steps.length, 0),
    errors,
  });
});

// ==================== 個別ルート ====================

// 経路マスタ詳細（ステップ含む）
routeMasters.get('/:id', async (c) => {
  const repo = getRepository();
  const master = await repo.getRouteMasterWithSteps(c.req.param('id'));
  if (!master) return c.json({ error: '経路マスタが見つかりません' }, 404);
  return c.json({ routeMaster: master });
});

// 経路マスタ作成
routeMasters.post('/', async (c) => {
  const body = await c.req.json();
  const repo = getRepository();
  const master = await repo.createRouteMaster({
    name: body.name,
    description: body.description || '',
    workflowId: body.workflowId,
    routeType: body.routeType || 'basic',
    priority: body.priority || 1,
    targetPositionId: body.targetPositionId || null,
    targetDepartmentId: body.targetDepartmentId || null,
    targetUserId: body.targetUserId || null,
    isStandard: body.isStandard || false,
    isActive: body.isActive !== false,
    conditions: body.conditions || null,
  });
  return c.json({ routeMaster: master }, 201);
});

// 経路マスタ更新
routeMasters.put('/:id', async (c) => {
  const repo = getRepository();
  const existing = await repo.getRouteMaster(c.req.param('id'));
  if (!existing) return c.json({ error: '経路マスタが見つかりません' }, 404);
  const body = await c.req.json();
  const updated = await repo.updateRouteMaster(c.req.param('id'), body);
  return c.json({ routeMaster: updated });
});

// 経路マスタ削除
routeMasters.delete('/:id', async (c) => {
  const repo = getRepository();
  const existing = await repo.getRouteMaster(c.req.param('id'));
  if (!existing) return c.json({ error: '経路マスタが見つかりません' }, 404);
  await repo.deleteRouteMaster(c.req.param('id'));
  return c.json({ success: true });
});

// 経路マスタコピー
routeMasters.post('/:id/copy', async (c) => {
  const repo = getRepository();
  const source = await repo.getRouteMasterWithSteps(c.req.param('id'));
  if (!source) return c.json({ error: '経路マスタが見つかりません' }, 404);
  const body = await c.req.json();
  const newMaster = await repo.createRouteMaster({
    name: body.name || `${source.name} (コピー)`,
    description: source.description,
    workflowId: source.workflowId,
    routeType: source.routeType,
    priority: source.priority,
    targetPositionId: source.targetPositionId,
    targetDepartmentId: source.targetDepartmentId,
    targetUserId: source.targetUserId,
    isStandard: false,
    isActive: true,
    conditions: source.conditions,
  });
  // ステップもコピー
  for (const step of source.steps) {
    await repo.createRouteStep({
      routeMasterId: newMaster.id,
      stepOrder: step.stepOrder,
      stepType: step.stepType,
      positionId: step.positionId,
      approvalRoleId: step.approvalRoleId,
      specificUserId: step.specificUserId,
      label: step.label,
      isRequired: step.isRequired,
      skipIfSamePerson: step.skipIfSamePerson,
      skipIfVacant: step.skipIfVacant,
      conditions: step.conditions,
      stepRoleType: step.stepRoleType,
      multiApproverMode: step.multiApproverMode,
      requiredApproverCount: step.requiredApproverCount,
      deadlineDays: step.deadlineDays,
      deadlineAutoAction: step.deadlineAutoAction,
      remandMode: step.remandMode,
      allowSelfApproval: step.allowSelfApproval,
      editableFields: step.editableFields,
    });
  }
  const result = await repo.getRouteMasterWithSteps(newMaster.id);
  return c.json({ routeMaster: result }, 201);
});

// ステップ追加
routeMasters.post('/:id/steps', async (c) => {
  const repo = getRepository();
  const master = await repo.getRouteMaster(c.req.param('id'));
  if (!master) return c.json({ error: '経路マスタが見つかりません' }, 404);
  const body = await c.req.json();
  const step = await repo.createRouteStep({
    routeMasterId: master.id,
    stepOrder: body.stepOrder,
    stepType: body.stepType || 'position',
    positionId: body.positionId || null,
    approvalRoleId: body.approvalRoleId || null,
    specificUserId: body.specificUserId || null,
    label: body.label || null,
    isRequired: body.isRequired !== false,
    skipIfSamePerson: body.skipIfSamePerson !== false,
    skipIfVacant: body.skipIfVacant !== false,
    conditions: body.conditions || null,
    stepRoleType: body.stepRoleType || 'approver',
    multiApproverMode: body.multiApproverMode || 'single',
    requiredApproverCount: body.requiredApproverCount || null,
    deadlineDays: body.deadlineDays || null,
    deadlineAutoAction: body.deadlineAutoAction || 'none',
    remandMode: body.remandMode || 'require_reapproval',
    allowSelfApproval: body.allowSelfApproval || false,
    editableFields: body.editableFields || null,
  });
  return c.json({ step }, 201);
});

// ステップ更新
routeMasters.put('/:id/steps/:stepId', async (c) => {
  const repo = getRepository();
  const master = await repo.getRouteMaster(c.req.param('id'));
  if (!master) return c.json({ error: '経路マスタが見つかりません' }, 404);
  const body = await c.req.json();
  const step = await repo.updateRouteStep(c.req.param('stepId'), body);
  return c.json({ step });
});

// ステップ削除
routeMasters.delete('/:id/steps/:stepId', async (c) => {
  const repo = getRepository();
  const master = await repo.getRouteMaster(c.req.param('id'));
  if (!master) return c.json({ error: '経路マスタが見つかりません' }, 404);
  await repo.deleteRouteStep(c.req.param('stepId'));
  return c.json({ success: true });
});

// CSVエクスポート（個別経路）
routeMasters.get('/export/:id', async (c) => {
  const repo = getRepository();
  const master = await repo.getRouteMasterWithSteps(c.req.param('id'));
  if (!master) return c.json({ error: '経路マスタが見つかりません' }, 404);

  const headers = ['step_order', 'step_type', 'position_id', 'approval_role_id', 'specific_user_id', 'label', 'is_required', 'step_role_type', 'multi_approver_mode', 'deadline_days'];
  const rows = master.steps.map(s => [
    s.stepOrder, s.stepType, s.positionId || '', s.approvalRoleId || '', s.specificUserId || '',
    s.label || '', s.isRequired, s.stepRoleType, s.multiApproverMode, s.deadlineDays || '',
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="route-${master.id}.csv"`,
    },
  });
});

// CSVインポート
routeMasters.post('/import', async (c) => {
  const body = await c.req.json();
  const { routeMasterId, csvData } = body;
  if (!routeMasterId || !csvData) return c.json({ error: 'routeMasterIdとcsvDataが必要です' }, 400);

  const repo = getRepository();
  const master = await repo.getRouteMaster(routeMasterId);
  if (!master) return c.json({ error: '経路マスタが見つかりません' }, 404);

  const lines = (csvData as string).trim().split('\n');
  if (lines.length < 2) return c.json({ error: 'CSVデータが不足しています' }, 400);

  // 既存ステップ削除
  const existingSteps = await repo.getRouteSteps(routeMasterId);
  for (const step of existingSteps) {
    await repo.deleteRouteStep(step.id);
  }

  // ヘッダー解析
  const headerLine = lines[0].split(',').map(h => h.trim());
  const imported: RouteStep[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row: Record<string, string> = {};
    headerLine.forEach((h, idx) => { row[h] = values[idx] || ''; });

    const step = await repo.createRouteStep({
      routeMasterId,
      stepOrder: parseInt(row.step_order, 10) || i,
      stepType: (row.step_type as RouteStep['stepType']) || 'position',
      positionId: row.position_id || null,
      approvalRoleId: row.approval_role_id || null,
      specificUserId: row.specific_user_id || null,
      label: row.label || null,
      isRequired: row.is_required !== 'false',
      skipIfSamePerson: true,
      skipIfVacant: true,
      conditions: null,
      stepRoleType: (row.step_role_type as RouteStep['stepRoleType']) || 'approver',
      multiApproverMode: (row.multi_approver_mode as RouteStep['multiApproverMode']) || 'single',
      requiredApproverCount: row.required_approver_count ? parseInt(row.required_approver_count, 10) : null,
      deadlineDays: row.deadline_days ? parseInt(row.deadline_days, 10) : null,
      deadlineAutoAction: 'none',
      remandMode: 'require_reapproval',
      allowSelfApproval: false,
      editableFields: null,
    });
    imported.push(step);
  }

  return c.json({ imported: imported.length, steps: imported });
});

export default routeMasters;
