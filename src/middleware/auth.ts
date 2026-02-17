import type { Context, Next } from 'hono';
import { getRepository } from '../repositories/lark-base.repository.js';
import type { UserRoleType } from '../models/user.js';

// 認証ミドルウェア - X-User-Id ヘッダーからユーザーを検証
export const requireAuth = async (c: Context, next: Next): Promise<Response | void> => {
  const userId = c.req.header('X-User-Id');

  if (!userId) {
    return c.json({ error: '認証が必要です' }, 401);
  }

  try {
    const repo = getRepository();
    const user = await repo.getUser(userId);

    if (!user) {
      return c.json({ error: 'ユーザーが見つかりません' }, 401);
    }

    if (!user.isActive) {
      return c.json({ error: 'アカウントが無効です' }, 403);
    }

    // ユーザー情報をコンテキストに設定
    c.set('currentUser', user);
    return next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return c.json({ error: '認証エラー' }, 500);
  }
};

// ロールチェックミドルウェア - 指定ロール以上の権限が必要
const ROLE_HIERARCHY: Record<string, number> = {
  user: 0,
  manager: 1,
  admin: 2,
};

export const requireRole = (...allowedRoles: UserRoleType[]) => {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const user = c.get('currentUser');

    if (!user) {
      return c.json({ error: '認証が必要です' }, 401);
    }

    const userLevel = ROLE_HIERARCHY[user.role] ?? 0;
    const requiredLevel = Math.min(...allowedRoles.map((r) => ROLE_HIERARCHY[r] ?? 0));

    if (userLevel < requiredLevel) {
      return c.json({
        error: 'アクセス権限がありません',
        required: allowedRoles,
        current: user.role,
      }, 403);
    }

    return next();
  };
};

// 管理者のみ
export const requireAdmin = requireRole('admin');

// マネージャー以上
export const requireManager = requireRole('admin', 'manager');
