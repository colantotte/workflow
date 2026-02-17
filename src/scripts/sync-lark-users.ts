/**
 * Lark Contact API → Lark Base 同期スクリプト
 *
 * 使用方法:
 *   npx tsx src/scripts/sync-lark-users.ts
 *
 * Lark管理コンソールのメンバー・部署情報を取得し、
 * ワークフローBaseのユーザーテーブル・組織マスタテーブルに同期します。
 */
import dotenv from 'dotenv';
dotenv.config({ override: true });
import { initLarkClient } from '../lark/client.js';
import { getRepository } from '../repositories/lark-base.repository.js';
import { ContactService } from '../services/contact.service.js';
import { syncAll } from '../services/sync.service.js';

// Larkクライアント初期化
initLarkClient({
  appId: process.env.LARK_APP_ID!,
  appSecret: process.env.LARK_APP_SECRET!,
});

async function main() {
  console.log('=== Lark Contact → Lark Base 同期 ===\n');

  const repo = getRepository();
  const contactService = new ContactService();

  try {
    const result = await syncAll(repo, contactService);

    console.log('\n=== 同期完了 ===');
    console.log(`部署: 作成=${result.departments.created}, 更新=${result.departments.updated}, 無効化=${result.departments.deactivated}`);
    console.log(`ユーザー: 作成=${result.users.created}, 更新=${result.users.updated}, 無効化=${result.users.deactivated}, 変更なし=${result.users.unchanged}`);
  } catch (err) {
    console.error('同期中にエラーが発生しました:', err);
    process.exit(1);
  }
}

main();
