import { Hono } from 'hono';
import { getRepository } from '../repositories/lark-base.repository.js';

const proxySettings = new Hono();

// 代理設定一覧
proxySettings.get('/', async (c) => {
  const repo = getRepository();
  const settings = await repo.getProxySettings();
  return c.json({ proxySettings: settings });
});

// 代理設定作成
proxySettings.post('/', async (c) => {
  const body = await c.req.json();
  const repo = getRepository();
  const setting = await repo.createProxySetting({
    principalUserId: body.principalUserId,
    proxyUserId: body.proxyUserId,
    proxyType: body.proxyType || 'application',
    targetRoles: body.targetRoles || [],
    validFrom: new Date(body.validFrom),
    validTo: body.validTo ? new Date(body.validTo) : null,
    isActive: body.isActive !== false,
  });
  return c.json({ proxySetting: setting }, 201);
});

// 代理設定更新
proxySettings.put('/:id', async (c) => {
  const repo = getRepository();
  const body = await c.req.json();
  const data: Record<string, unknown> = {};
  if (body.principalUserId !== undefined) data.principalUserId = body.principalUserId;
  if (body.proxyUserId !== undefined) data.proxyUserId = body.proxyUserId;
  if (body.proxyType !== undefined) data.proxyType = body.proxyType;
  if (body.targetRoles !== undefined) data.targetRoles = body.targetRoles;
  if (body.validFrom !== undefined) data.validFrom = new Date(body.validFrom);
  if (body.validTo !== undefined) data.validTo = body.validTo ? new Date(body.validTo) : null;
  if (body.isActive !== undefined) data.isActive = body.isActive;
  const updated = await repo.updateProxySetting(c.req.param('id'), data);
  return c.json({ proxySetting: updated });
});

// 代理設定削除
proxySettings.delete('/:id', async (c) => {
  const repo = getRepository();
  await repo.deleteProxySetting(c.req.param('id'));
  return c.json({ success: true });
});

export default proxySettings;
