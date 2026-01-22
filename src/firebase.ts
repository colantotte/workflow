import 'dotenv/config';
import { onRequest } from 'firebase-functions/v2/https';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { api } from './routes/index.js';
import { initLarkClient } from './lark/client.js';

// 環境変数
const LARK_APP_ID = process.env.LARK_APP_ID ?? '';
const LARK_APP_SECRET = process.env.LARK_APP_SECRET ?? '';

// Larkクライアント初期化
if (LARK_APP_ID && LARK_APP_SECRET) {
  initLarkClient({
    appId: LARK_APP_ID,
    appSecret: LARK_APP_SECRET,
  });
}

// Honoアプリ作成
const app = new Hono().basePath('/api');

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

// APIルート
app.route('/', api);

// エラーハンドリング
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json(
    {
      error: err.message,
    },
    500
  );
});

// 404ハンドリング
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// Firebase Functions エクスポート
export const apiFunc = onRequest(
  {
    region: 'asia-northeast1',
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (req, res) => {
    // Hono の fetch adapter を使用
    const url = new URL(req.url, `https://${req.headers.host}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        headers.set(key, Array.isArray(value) ? value[0] : value);
      }
    }

    const request = new Request(url.toString(), {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });

    const response = await app.fetch(request);

    res.status(response.status);
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    res.send(await response.text());
  }
);
