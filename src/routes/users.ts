import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  CreateUserSchema,
  CreateUserPositionSchema,
} from '../models/index.js';
import { getRepository } from '../repositories/lark-base.repository.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

export const userRoutes = new Hono();

// ユーザー一覧取得
userRoutes.get('/', async (c) => {
  const repo = getRepository();
  const users = await repo.listUsers();
  return c.json({ users, total: users.length });
});

// Lark IDでユーザー取得
userRoutes.get('/lark/:larkId', async (c) => {
  const larkId = c.req.param('larkId');
  const repo = getRepository();
  const user = await repo.getUserByLarkId(larkId);
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  // 役職情報も取得
  const positions = await repo.getUserPositions(user.id);
  const primaryPosition = positions.find((p) => p.isPrimary);

  return c.json({
    user: {
      ...user,
      organizationId: primaryPosition?.organizationId || null,
    },
  });
});

// ユーザー詳細取得（役職・承認ロール含む）
userRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const repo = getRepository();
  const user = await repo.getUser(id);
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }
  return c.json({ user });
});

// ユーザー作成（管理者のみ）
userRoutes.post(
  '/',
  requireAuth,
  requireAdmin,
  zValidator('json', CreateUserSchema),
  async (c) => {
    const data = c.req.valid('json');
    // TODO: Lark Baseに作成
    return c.json({ user: { id: 'new-id', ...data } }, 201);
  }
);

// ユーザー更新（管理者のみ）
userRoutes.put('/:id', requireAuth, requireAdmin, async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  // TODO: Lark Baseを更新
  return c.json({ user: { id, ...data } });
});

// ユーザー削除（管理者のみ）
userRoutes.delete('/:id', requireAuth, requireAdmin, async (c) => {
  const id = c.req.param('id');
  // TODO: Lark Baseで isActive を false に
  return c.json({ success: true });
});

// --- 役職管理 ---

// ユーザーの役職一覧
userRoutes.get('/:id/positions', async (c) => {
  const userId = c.req.param('id');
  // TODO: Lark Baseから取得
  return c.json({ positions: [] });
});

// 役職を付与（管理者のみ）
userRoutes.post(
  '/:id/positions',
  requireAuth,
  requireAdmin,
  zValidator('json', CreateUserPositionSchema.omit({ userId: true })),
  async (c) => {
    const userId = c.req.param('id');
    const data = c.req.valid('json');
    // TODO: Lark Baseに作成
    return c.json({ position: { id: 'new-id', userId, ...data } }, 201);
  }
);

// 役職を解除（管理者のみ）
userRoutes.delete('/:id/positions/:positionId', requireAuth, requireAdmin, async (c) => {
  const userId = c.req.param('id');
  const positionId = c.req.param('positionId');
  // TODO: valid_to を設定
  return c.json({ success: true });
});

// --- 承認ロール管理 ---

// ユーザーの承認ロール一覧
userRoutes.get('/:id/approval-roles', async (c) => {
  const userId = c.req.param('id');
  const repo = getRepository();
  const approvalRoles = await repo.getUserApprovalRoles(userId);
  return c.json({ approvalRoles });
});

// 承認ロールを付与（管理者のみ）
userRoutes.post('/:id/approval-roles', requireAuth, requireAdmin, async (c) => {
  const userId = c.req.param('id');
  const body = await c.req.json();
  if (!body.approvalRoleName || typeof body.approvalRoleName !== 'string') {
    return c.json({ error: '承認ロール名は必須です' }, 400);
  }
  const repo = getRepository();
  const record = await repo.createUserApprovalRole({
    userId,
    approvalRoleName: body.approvalRoleName,
    targetOrganizationCode: body.targetOrganizationCode || undefined,
    validFrom: body.validFrom ? new Date(body.validFrom) : undefined,
    validTo: body.validTo ? new Date(body.validTo) : undefined,
  });
  return c.json({ approvalRole: record }, 201);
});

// 承認ロールを解除（管理者のみ）
userRoutes.delete('/:id/approval-roles/:roleId', requireAuth, requireAdmin, async (c) => {
  const roleId = c.req.param('roleId');
  const repo = getRepository();
  await repo.deleteUserApprovalRole(roleId);
  return c.json({ success: true });
});

// Larkユーザーとの同期（管理者のみ）
userRoutes.post('/sync-from-lark', requireAuth, requireAdmin, async (c) => {
  const { ContactService } = await import('../services/contact.service.js');
  const { syncAll } = await import('../services/sync.service.js');

  const repo = getRepository();
  const contactService = new ContactService();

  const result = await syncAll(repo, contactService);

  return c.json({
    success: true,
    departments: result.departments,
    users: result.users,
  });
});
