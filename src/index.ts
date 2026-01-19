import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { api } from './routes/index.js';
import { initLarkClient } from './lark/client.js';

// 環境変数
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const LARK_APP_ID = process.env.LARK_APP_ID ?? '';
const LARK_APP_SECRET = process.env.LARK_APP_SECRET ?? '';

// Larkクライアント初期化
if (LARK_APP_ID && LARK_APP_SECRET) {
  initLarkClient({
    appId: LARK_APP_ID,
    appSecret: LARK_APP_SECRET,
  });
  console.log('✅ Lark client initialized');
} else {
  console.warn('⚠️  Lark credentials not found. Set LARK_APP_ID and LARK_APP_SECRET.');
}

// Honoアプリ作成
const app = new Hono();

// ミドルウェア
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

// ルートパス
app.get('/', (c) => {
  return c.json({
    name: 'Lark Workflow API',
    version: '0.1.0',
    description: 'Lark Base Approval Workflow System',
  });
});

// APIルート
app.route('/api', api);

// エラーハンドリング
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json(
    {
      error: err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
    500
  );
});

// 404ハンドリング
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// サーバー起動
console.log(`
╔════════════════════════════════════════════╗
║   🚀 Lark Workflow API Server              ║
║   Port: ${PORT.toString().padEnd(35)}║
║   Mode: ${(process.env.NODE_ENV ?? 'development').padEnd(35)}║
╚════════════════════════════════════════════╝
`);

serve({
  fetch: app.fetch,
  port: PORT,
});
