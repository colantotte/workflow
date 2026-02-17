import { Hono } from 'hono';
import { getRepository } from '../repositories/lark-base.repository.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const approvalRoleRoutes = new Hono();

// 承認ロール一覧取得
approvalRoleRoutes.get('/', async (c) => {
  const repo = getRepository();
  const roles = await repo.listApprovalRoles();
  return c.json({ approvalRoles: roles });
});

// 承認ロール詳細取得（割当メンバー含む）
approvalRoleRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const repo = getRepository();
  const role = await repo.getApprovalRole(id);
  if (!role) {
    return c.json({ error: '承認ロールが見つかりません' }, 404);
  }
  const members = await repo.getUsersByApprovalRole(role.name);
  return c.json({ approvalRole: role, members });
});

// 承認ロール作成（管理者のみ）
approvalRoleRoutes.post('/', requireAuth, requireAdmin, async (c) => {
  const body = await c.req.json();
  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    return c.json({ error: 'ロール名は必須です' }, 400);
  }
  const repo = getRepository();
  const role = await repo.createApprovalRole({
    name: body.name.trim(),
    description: body.description || '',
    isActive: body.isActive !== false,
  });
  return c.json({ approvalRole: role }, 201);
});

// 承認ロール更新（管理者のみ）
approvalRoleRoutes.put('/:id', requireAuth, requireAdmin, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const repo = getRepository();
  const role = await repo.updateApprovalRole(id, {
    name: body.name,
    description: body.description,
    isActive: body.isActive,
  });
  return c.json({ approvalRole: role });
});

// 承認ロール削除（管理者のみ）
approvalRoleRoutes.delete('/:id', requireAuth, requireAdmin, async (c) => {
  const id = c.req.param('id');
  const repo = getRepository();
  await repo.deleteApprovalRole(id);
  return c.json({ success: true });
});

export default approvalRoleRoutes;
