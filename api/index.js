import 'dotenv/config';
import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { cors } from 'hono/cors';
import { api } from '../src/routes/index.js';
import { initLarkClient } from '../src/lark/client.js';
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
app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-User-Id'],
}));
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
// Vercel用エクスポート
export default handle(app);
//# sourceMappingURL=index.js.map