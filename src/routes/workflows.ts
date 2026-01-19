import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  CreateWorkflowDefinitionSchema,
  CreateApprovalStepSchema,
} from '../models/index.js';
import { getRepository } from '../repositories/lark-base.repository.js';

export const workflowRoutes = new Hono();

// ワークフロー一覧取得
workflowRoutes.get('/', async (c) => {
  const category = c.req.query('category');
  const repo = getRepository();
  const workflows = await repo.listWorkflows(category);
  return c.json({ workflows, total: workflows.length });
});

// ワークフロー詳細取得（ステップ含む）
workflowRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const repo = getRepository();
  const workflow = await repo.getWorkflowWithSteps(id);

  if (!workflow) {
    return c.json({ error: 'Workflow not found' }, 404);
  }

  return c.json({ workflow });
});

// ワークフロー作成
workflowRoutes.post(
  '/',
  zValidator('json', CreateWorkflowDefinitionSchema),
  async (c) => {
    const data = c.req.valid('json');
    const repo = getRepository();
    const workflow = await repo.createWorkflow({
      name: data.name,
      description: data.description,
      category: data.category,
      isActive: data.isActive,
    });
    return c.json({ workflow: { ...workflow, steps: [] } }, 201);
  }
);

// ワークフロー更新
workflowRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  const repo = getRepository();

  const existing = await repo.getWorkflow(id);
  if (!existing) {
    return c.json({ error: 'Workflow not found' }, 404);
  }

  const workflow = await repo.updateWorkflow(id, {
    name: data.name,
    description: data.description,
    category: data.category,
    isActive: data.isActive,
  });
  return c.json({ workflow });
});

// ワークフロー削除
workflowRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const repo = getRepository();

  const existing = await repo.getWorkflow(id);
  if (!existing) {
    return c.json({ error: 'Workflow not found' }, 404);
  }

  // 使用中の申請があるかチェック
  const requests = await repo.listRequests({ workflowId: id });
  const activeRequests = requests.filter((r) => r.status === 'pending');
  if (activeRequests.length > 0) {
    return c.json({ error: 'Cannot delete workflow with active requests' }, 400);
  }

  await repo.deleteWorkflow(id);
  return c.json({ success: true });
});

// --- 承認ステップ管理 ---

// ステップ一覧
workflowRoutes.get('/:id/steps', async (c) => {
  const workflowId = c.req.param('id');
  const repo = getRepository();
  const steps = await repo.getApprovalSteps(workflowId);
  return c.json({ steps });
});

// ステップ追加
workflowRoutes.post(
  '/:id/steps',
  zValidator('json', CreateApprovalStepSchema.omit({ workflowId: true })),
  async (c) => {
    const workflowId = c.req.param('id');
    const data = c.req.valid('json');
    const repo = getRepository();

    const workflow = await repo.getWorkflow(workflowId);
    if (!workflow) {
      return c.json({ error: 'Workflow not found' }, 404);
    }

    const step = await repo.createApprovalStep(workflowId, {
      stepOrder: data.stepOrder,
      stepType: data.stepType,
      positionName: data.positionId ?? undefined,
      approvalRoleName: data.approvalRoleId ?? undefined,
      specificUserId: data.specificUserId ?? undefined,
      label: data.label ?? `ステップ${data.stepOrder}`,
      isRequired: data.isRequired,
      skipIfSamePerson: data.skipIfSamePerson,
      skipIfVacant: data.skipIfVacant,
    });
    return c.json({ step }, 201);
  }
);

// ステップ更新
workflowRoutes.put('/:id/steps/:stepId', async (c) => {
  const stepId = c.req.param('stepId');
  const data = await c.req.json();
  const repo = getRepository();

  const step = await repo.updateApprovalStep(stepId, {
    stepOrder: data.stepOrder,
    stepType: data.stepType,
    label: data.label,
    isRequired: data.isRequired,
    skipIfSamePerson: data.skipIfSamePerson,
    skipIfVacant: data.skipIfVacant,
  });
  return c.json({ step });
});

// ステップ削除
workflowRoutes.delete('/:id/steps/:stepId', async (c) => {
  const stepId = c.req.param('stepId');
  const repo = getRepository();

  await repo.deleteApprovalStep(stepId);
  return c.json({ success: true });
});

// ステップ順序変更
workflowRoutes.post('/:id/steps/reorder', async (c) => {
  const workflowId = c.req.param('id');
  const { stepIds } = await c.req.json<{ stepIds: string[] }>();
  const repo = getRepository();

  // 各ステップの順序を更新
  for (let i = 0; i < stepIds.length; i++) {
    await repo.updateApprovalStep(stepIds[i], { stepOrder: i + 1 });
  }

  const steps = await repo.getApprovalSteps(workflowId);
  return c.json({ success: true, steps });
});

// ワークフローをコピー
workflowRoutes.post('/:id/copy', async (c) => {
  const id = c.req.param('id');
  const { name } = await c.req.json<{ name: string }>();
  const repo = getRepository();

  const source = await repo.getWorkflowWithSteps(id);
  if (!source) {
    return c.json({ error: 'Workflow not found' }, 404);
  }

  // ワークフローをコピー
  const newWorkflow = await repo.createWorkflow({
    name,
    description: source.description,
    category: source.category,
    isActive: source.isActive,
  });

  // ステップをコピー
  for (const step of source.steps) {
    await repo.createApprovalStep(newWorkflow.id, {
      stepOrder: step.stepOrder,
      stepType: step.stepType,
      positionName: step.positionId ?? undefined,
      approvalRoleName: step.approvalRoleId ?? undefined,
      specificUserId: step.specificUserId ?? undefined,
      label: step.label ?? `ステップ${step.stepOrder}`,
      isRequired: step.isRequired,
      skipIfSamePerson: step.skipIfSamePerson,
      skipIfVacant: step.skipIfVacant,
    });
  }

  const workflow = await repo.getWorkflowWithSteps(newWorkflow.id);
  return c.json({ workflow }, 201);
});
