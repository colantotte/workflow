import { Hono } from 'hono';
import { organizationRoutes } from './organizations.js';
import { userRoutes } from './users.js';
import { workflowRoutes } from './workflows.js';
import { requestRoutes } from './requests.js';
import { importRoutes } from './import.js';
import { larkWebhookRoutes } from './lark-webhook.js';
import { authRoutes } from './auth.js';

const api = new Hono();

// ヘルスチェック
api.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 各種ルート
api.route('/organizations', organizationRoutes);
api.route('/users', userRoutes);
api.route('/workflows', workflowRoutes);
api.route('/requests', requestRoutes);
api.route('/import', importRoutes);
api.route('/lark', larkWebhookRoutes);
api.route('/auth', authRoutes);

export { api };
