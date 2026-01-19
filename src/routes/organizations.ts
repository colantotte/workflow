import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  CreateOrganizationSchema,
  UpdateOrganizationSchema,
  OrganizationLevel,
} from '../models/index.js';

export const organizationRoutes = new Hono();

// 組織一覧取得
organizationRoutes.get('/', async (c) => {
  // TODO: Lark Baseから取得
  return c.json({ organizations: [], total: 0 });
});

// 組織詳細取得
organizationRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  // TODO: Lark Baseから取得
  return c.json({ organization: null });
});

// 組織作成
organizationRoutes.post(
  '/',
  zValidator('json', CreateOrganizationSchema),
  async (c) => {
    const data = c.req.valid('json');
    // TODO: Lark Baseに作成
    return c.json({ organization: { id: 'new-id', ...data } }, 201);
  }
);

// 組織更新
organizationRoutes.put(
  '/:id',
  zValidator('json', UpdateOrganizationSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    // TODO: Lark Baseを更新
    return c.json({ organization: { id, ...data } });
  }
);

// 組織削除
organizationRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  // TODO: Lark Baseから削除
  return c.json({ success: true });
});

// 組織ツリー取得
organizationRoutes.get('/tree', async (c) => {
  // TODO: 階層構造で取得
  return c.json({ tree: [] });
});
