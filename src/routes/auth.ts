import { Hono } from 'hono';
import { getLarkClient } from '../lark/client.js';
import { getRepository } from '../repositories/lark-base.repository.js';

const authRoutes = new Hono();

// Lark OAuth設定
const LARK_APP_ID = process.env.LARK_APP_ID ?? '';
// 本番URLを優先使用（Lark Developer Consoleで登録済みのURL）
const REDIRECT_URI = process.env.REDIRECT_URI ?? 'https://workflow-chi-six.vercel.app';

// OAuth認証URL生成
authRoutes.get('/login', (c) => {
  const state = Math.random().toString(36).substring(7);
  const authUrl = `https://open.larksuite.com/open-apis/authen/v1/authorize?app_id=${LARK_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}`;

  return c.json({ authUrl, state });
});

// OAuth コールバック - 認証コードをトークンに交換
authRoutes.post('/callback', async (c) => {
  try {
    const { code } = await c.req.json();

    if (!code) {
      return c.json({ error: 'Authorization code is required' }, 400);
    }

    const client = getLarkClient();

    // 認証コードをアクセストークンに交換
    const tokenResponse = await client.authen.v1.oidcAccessToken.create({
      data: {
        grant_type: 'authorization_code',
        code: code,
      },
    });

    if (!tokenResponse.data?.access_token) {
      console.error('Token exchange failed:', tokenResponse);
      return c.json({ error: 'Failed to exchange code for token' }, 400);
    }

    const accessToken = tokenResponse.data.access_token;

    // ユーザー情報を取得
    const userResponse = await client.authen.v1.userInfo.get({
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userResponse.data) {
      console.error('User info fetch failed:', userResponse);
      return c.json({ error: 'Failed to get user info' }, 400);
    }

    const larkUserInfo = userResponse.data;
    console.log('Lark user info:', larkUserInfo);

    // システム内のユーザーを検索
    const repo = getRepository();
    const userId = larkUserInfo.user_id || larkUserInfo.open_id;

    if (!userId) {
      console.error('No user ID found in Lark response:', larkUserInfo);
      return c.json({ error: 'No user ID in Lark response' }, 400);
    }

    let user = await repo.getUserByLarkId(userId);

    if (!user) {
      // ユーザーが見つからない場合はエラー
      return c.json({
        error: 'User not registered',
        message: 'このユーザーはシステムに登録されていません',
        larkUser: {
          userId: userId,
          name: larkUserInfo.name,
          email: larkUserInfo.email,
        },
      }, 404);
    }

    return c.json({
      success: true,
      user: {
        id: user.id,
        larkUserId: user.larkUserId,
        name: user.name,
        email: user.email,
      },
      larkUser: {
        userId: userId,
        name: larkUserInfo.name,
        email: larkUserInfo.email,
        avatarUrl: larkUserInfo.avatar_url,
      },
    });

  } catch (err) {
    console.error('OAuth callback error:', err);
    return c.json({ error: 'Authentication failed', details: String(err) }, 500);
  }
});

// 現在のユーザー情報を取得（セッションベース - 簡易版）
authRoutes.get('/me', async (c) => {
  const userId = c.req.header('X-User-Id');

  if (!userId) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  try {
    const repo = getRepository();
    const user = await repo.getUser(userId);

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({ user });
  } catch (err) {
    console.error('Get me error:', err);
    return c.json({ error: 'Failed to get user info' }, 500);
  }
});

export { authRoutes };
