import { Hono } from 'hono';
import { organizationRoutes } from './organizations.js';
import { userRoutes } from './users.js';
import { workflowRoutes } from './workflows.js';
import { requestRoutes } from './requests.js';
import { importRoutes } from './import.js';
import { larkWebhookRoutes } from './lark-webhook.js';
import { authRoutes } from './auth.js';
import routeMasterRoutes from './route-masters.js';
import proxySettingRoutes from './proxy-settings.js';
import approvalRoleRoutes from './approval-roles.js';
import { requireAuth, requireAdmin, requireManager } from '../middleware/auth.js';

const api = new Hono();

// ヘルスチェック（認証不要）
api.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 認証関連（認証不要）
api.route('/auth', authRoutes);

// Lark Webhook（認証不要 - Webhook署名で検証）
api.route('/lark', larkWebhookRoutes);

// --- 認証必要なルート ---

// 一般ユーザーがアクセスできるルート（認証のみ）
api.route('/requests', requestRoutes);

// 参照系は認証のみ、更新系はミドルウェアで制御するルート
api.route('/organizations', organizationRoutes);
api.route('/users', userRoutes);

// --- 管理者権限が必要なルート ---

// ワークフロー管理（GET以外はadmin/managerのみ）
api.route('/workflows', workflowRoutes);

// 経路マスタ管理
api.route('/route-masters', routeMasterRoutes);

// 代理設定管理
api.route('/proxy-settings', proxySettingRoutes);

// 承認ロール管理
api.route('/approval-roles', approvalRoleRoutes);

// インポート（admin/managerのみ）
const protectedImport = new Hono();
protectedImport.use('*', requireAuth, requireManager);
protectedImport.route('/', importRoutes);
api.route('/import', protectedImport);

export { api };
