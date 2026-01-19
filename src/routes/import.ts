import { Hono } from 'hono';
import { ImportService } from '../services/import.service.js';

export const importRoutes = new Hono();
const importService = new ImportService();

// 組織マスタ一括インポート（CSV）
importRoutes.post('/organizations', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || typeof file === 'string') {
    return c.json({ error: 'ファイルが必要です' }, 400);
  }

  const content = await file.text();
  const result = importService.parseOrganizations(content);

  if (!result.success) {
    return c.json(
      {
        success: false,
        errors: result.errors,
        validRows: result.validRows,
        errorRows: result.errorRows,
      },
      400
    );
  }

  // TODO: Lark Baseに保存
  return c.json({
    success: true,
    imported: result.data.length,
    message: `${result.data.length}件の組織をインポートしました`,
  });
});

// ユーザーマスタ一括インポート（CSV）
importRoutes.post('/users', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || typeof file === 'string') {
    return c.json({ error: 'ファイルが必要です' }, 400);
  }

  const content = await file.text();
  const result = importService.parseUsers(content);

  if (!result.success) {
    return c.json(
      {
        success: false,
        errors: result.errors,
        validRows: result.validRows,
        errorRows: result.errorRows,
      },
      400
    );
  }

  // TODO: Lark Baseに保存
  return c.json({
    success: true,
    imported: result.data.length,
    message: `${result.data.length}件のユーザーをインポートしました`,
  });
});

// ユーザー役職一括インポート（CSV）
importRoutes.post('/user-positions', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || typeof file === 'string') {
    return c.json({ error: 'ファイルが必要です' }, 400);
  }

  const content = await file.text();
  const result = importService.parseUserPositions(content);

  if (!result.success) {
    return c.json(
      {
        success: false,
        errors: result.errors,
        validRows: result.validRows,
        errorRows: result.errorRows,
      },
      400
    );
  }

  // TODO: Lark Baseに保存
  return c.json({
    success: true,
    imported: result.data.length,
    message: `${result.data.length}件のユーザー役職をインポートしました`,
  });
});

// ユーザー承認ロール一括インポート（CSV）
importRoutes.post('/user-approval-roles', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || typeof file === 'string') {
    return c.json({ error: 'ファイルが必要です' }, 400);
  }

  const content = await file.text();
  const result = importService.parseUserApprovalRoles(content);

  if (!result.success) {
    return c.json(
      {
        success: false,
        errors: result.errors,
        validRows: result.validRows,
        errorRows: result.errorRows,
      },
      400
    );
  }

  // TODO: Lark Baseに保存
  return c.json({
    success: true,
    imported: result.data.length,
    message: `${result.data.length}件の承認ロールをインポートしました`,
  });
});

// インポートプレビュー（バリデーションのみ）
importRoutes.post('/preview', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];
  const type = body['type'] as string;

  if (!file || typeof file === 'string') {
    return c.json({ error: 'ファイルが必要です' }, 400);
  }

  const content = await file.text();
  let result;

  switch (type) {
    case 'organizations':
      result = importService.parseOrganizations(content);
      break;
    case 'users':
      result = importService.parseUsers(content);
      break;
    case 'user-positions':
      result = importService.parseUserPositions(content);
      break;
    case 'user-approval-roles':
      result = importService.parseUserApprovalRoles(content);
      break;
    default:
      return c.json({ error: '無効なタイプです' }, 400);
  }

  return c.json({
    success: result.success,
    totalRows: result.totalRows,
    validRows: result.validRows,
    errorRows: result.errorRows,
    errors: result.errors,
    preview: result.data.slice(0, 10), // 最初の10件のみプレビュー
  });
});

// テンプレートダウンロード
importRoutes.get('/templates/:type', async (c) => {
  const type = c.req.param('type') as 'organizations' | 'users' | 'positions' | 'approval-roles';

  if (!['organizations', 'users', 'positions', 'approval-roles'].includes(type)) {
    return c.json({ error: '無効なタイプです' }, 400);
  }

  const buffer = await importService.generateTemplate(type);

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${type}-template.xlsx"`,
    },
  });
});
