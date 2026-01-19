import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  CreateWorkflowDefinitionSchema,
  CreateApprovalStepSchema,
} from '../models/index.js';

export const workflowRoutes = new Hono();

// ワークフロー一覧取得
workflowRoutes.get('/', async (c) => {
  const category = c.req.query('category');
  // TODO: Lark Baseから取得
  return c.json({ workflows: [], total: 0 });
});

// ワークフロー詳細取得（ステップ含む）
workflowRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  // TODO: Lark Baseから取得
  return c.json({ workflow: null });
});

// ワークフロー作成
workflowRoutes.post(
  '/',
  zValidator('json', CreateWorkflowDefinitionSchema),
  async (c) => {
    const data = c.req.valid('json');
    // TODO: Lark Baseに作成
    return c.json({ workflow: { id: 'new-id', ...data, steps: [] } }, 201);
  }
);

// ワークフロー更新
workflowRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  // TODO: Lark Baseを更新
  return c.json({ workflow: { id, ...data } });
});

// ワークフロー削除
workflowRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  // TODO: 使用中でないか確認してから削除
  return c.json({ success: true });
});

// --- 承認ステップ管理 ---

// ステップ一覧
workflowRoutes.get('/:id/steps', async (c) => {
  const workflowId = c.req.param('id');
  // TODO: Lark Baseから取得
  return c.json({ steps: [] });
});

// ステップ追加
workflowRoutes.post(
  '/:id/steps',
  zValidator('json', CreateApprovalStepSchema.omit({ workflowId: true })),
  async (c) => {
    const workflowId = c.req.param('id');
    const data = c.req.valid('json');
    // TODO: Lark Baseに作成
    return c.json({ step: { id: 'new-id', workflowId, ...data } }, 201);
  }
);

// ステップ更新
workflowRoutes.put('/:id/steps/:stepId', async (c) => {
  const workflowId = c.req.param('id');
  const stepId = c.req.param('stepId');
  const data = await c.req.json();
  // TODO: Lark Baseを更新
  return c.json({ step: { id: stepId, workflowId, ...data } });
});

// ステップ削除
workflowRoutes.delete('/:id/steps/:stepId', async (c) => {
  const workflowId = c.req.param('id');
  const stepId = c.req.param('stepId');
  // TODO: 順序を再整列してから削除
  return c.json({ success: true });
});

// ステップ順序変更
workflowRoutes.post('/:id/steps/reorder', async (c) => {
  const workflowId = c.req.param('id');
  const { stepIds } = await c.req.json<{ stepIds: string[] }>();
  // TODO: ステップの順序を更新
  return c.json({ success: true });
});

// ワークフローをコピー
workflowRoutes.post('/:id/copy', async (c) => {
  const id = c.req.param('id');
  const { name } = await c.req.json<{ name: string }>();
  // TODO: ワークフローとステップをコピー
  return c.json({ workflow: { id: 'new-id', name } }, 201);
});
