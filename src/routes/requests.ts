import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { CreateRequestSchema, RequestStatus } from '../models/index.js';

export const requestRoutes = new Hono();

// 申請一覧取得
requestRoutes.get('/', async (c) => {
  const status = c.req.query('status') as RequestStatus | undefined;
  const applicantId = c.req.query('applicantId');
  const workflowId = c.req.query('workflowId');
  // TODO: Lark Baseから取得
  return c.json({ requests: [], total: 0 });
});

// 自分の承認待ち申請一覧
requestRoutes.get('/pending-approval', async (c) => {
  // TODO: 現在のユーザーが承認者となっている申請を取得
  return c.json({ requests: [], total: 0 });
});

// 申請詳細取得（承認ルート含む）
requestRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  // TODO: Lark Baseから取得、承認ルートを解決
  return c.json({ request: null });
});

// 申請作成（下書き）
requestRoutes.post(
  '/',
  zValidator('json', CreateRequestSchema),
  async (c) => {
    const data = c.req.valid('json');
    // TODO: Lark Baseに作成
    return c.json(
      {
        request: {
          id: 'new-id',
          ...data,
          status: 'draft',
          currentStep: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      201
    );
  }
);

// 申請更新（下書き状態のみ）
requestRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  // TODO: status が draft の場合のみ更新可能
  return c.json({ request: { id, ...data } });
});

// 承認ルート確認（スキップ反映済み）
requestRoutes.get('/:id/route', async (c) => {
  const id = c.req.param('id');
  // TODO: ApprovalService.resolveApprovalRoute を呼び出し
  return c.json({ route: [] });
});

// 申請提出
requestRoutes.post('/:id/submit', async (c) => {
  const id = c.req.param('id');
  // TODO: status を pending に、currentStep を 1 に
  // TODO: 最初の承認者に通知
  return c.json({ success: true, request: null });
});

// 承認
requestRoutes.post(
  '/:id/approve',
  zValidator(
    'json',
    z.object({
      comment: z.string().max(1000).optional(),
    })
  ),
  async (c) => {
    const id = c.req.param('id');
    const { comment } = c.req.valid('json');
    // TODO: 承認履歴を記録
    // TODO: 次のステップに進める（スキップ処理含む）
    // TODO: 完了した場合は status を approved に
    // TODO: 通知を送信
    return c.json({ success: true, request: null });
  }
);

// 却下
requestRoutes.post(
  '/:id/reject',
  zValidator(
    'json',
    z.object({
      comment: z.string().min(1).max(1000),
    })
  ),
  async (c) => {
    const id = c.req.param('id');
    const { comment } = c.req.valid('json');
    // TODO: 承認履歴を記録
    // TODO: status を rejected に
    // TODO: 申請者に通知
    return c.json({ success: true, request: null });
  }
);

// 差戻し
requestRoutes.post(
  '/:id/remand',
  zValidator(
    'json',
    z.object({
      comment: z.string().min(1).max(1000),
      toStep: z.number().int().min(0).optional(), // 0 = 申請者に戻す
    })
  ),
  async (c) => {
    const id = c.req.param('id');
    const { comment, toStep } = c.req.valid('json');
    // TODO: 承認履歴を記録
    // TODO: currentStep を toStep に戻す（デフォルト: 0）
    // TODO: status を remanded に
    // TODO: 申請者に通知
    return c.json({ success: true, request: null });
  }
);

// 取消し
requestRoutes.post('/:id/cancel', async (c) => {
  const id = c.req.param('id');
  // TODO: status を cancelled に
  // TODO: 現在の承認者に取消し通知
  return c.json({ success: true, request: null });
});

// 承認履歴取得
requestRoutes.get('/:id/history', async (c) => {
  const id = c.req.param('id');
  // TODO: Lark Baseから取得
  return c.json({ history: [] });
});
