import type { VercelRequest, VercelResponse } from '@vercel/node';
import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { api } from '../dist/routes/index.js';
import { initLarkClient } from '../dist/lark/client.js';

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
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-User-Id'],
  })
);

// APIルート
app.route('/', api);

// エラーハンドリング
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({ error: err.message }, 500);
});

// 404ハンドリング
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// Vercel Serverless Function handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  const request = new Request(url.toString(), {
    method: req.method,
    headers: req.headers as HeadersInit,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
  });

  const response = await app.fetch(request);

  // Set response headers
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  res.status(response.status);

  const body = await response.text();
  res.send(body);
}
