import dotenv from 'dotenv';
dotenv.config({ override: true });
import { initLarkClient, getLarkClient } from '../lark/client.js';

const LARK_APP_ID = process.env.LARK_APP_ID ?? '';
const LARK_APP_SECRET = process.env.LARK_APP_SECRET ?? '';

// テスト対象（user_id または email）
const TEST_TARGET = process.argv[2] || '';
const TARGET_TYPE = process.argv[3] || 'email'; // 'user_id' or 'email'

async function main() {
  console.log('============================================================');
  console.log('🔔 Lark Bot 通知テスト');
  console.log('============================================================\n');

  // Larkクライアント初期化
  initLarkClient({ appId: LARK_APP_ID, appSecret: LARK_APP_SECRET });
  console.log('✅ Lark クライアント初期化完了\n');

  if (!TEST_TARGET) {
    console.log('❌ 送信先が指定されていません。');
    console.log('\n使用方法:');
    console.log('  # メールアドレスで送信（デフォルト）');
    console.log('  npx tsx src/scripts/test-notification.ts your@email.com email');
    console.log('\n  # ユーザーIDで送信');
    console.log('  npx tsx src/scripts/test-notification.ts ou_xxxxx user_id');
    console.log('\n例:');
    console.log('  npx tsx src/scripts/test-notification.ts tanaka@company.com email');
    console.log('  npx tsx src/scripts/test-notification.ts ou_xxxxxxxxxxxxxxxx user_id');
    return;
  }

  console.log(`📧 送信先: ${TEST_TARGET} (${TARGET_TYPE})\n`);

  const client = getLarkClient();

  // メッセージ送信関数
  async function sendTestMessage(title: string, text: string, template: string = 'blue') {
    const card = {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: title },
        template,
      },
      elements: [
        { tag: 'div', text: { tag: 'lark_md', content: text } },
        {
          tag: 'action',
          actions: [{
            tag: 'button',
            text: { tag: 'plain_text', content: '詳細を確認' },
            type: 'primary',
            url: 'http://localhost:3003/',
          }],
        },
      ],
    };

    await client.im.v1.message.create({
      params: {
        receive_id_type: TARGET_TYPE === 'email' ? 'email' : 'user_id',
      },
      data: {
        receive_id: TEST_TARGET,
        msg_type: 'interactive',
        content: JSON.stringify(card),
      },
    });
  }

  // テスト1: 承認依頼通知
  console.log('--- テスト1: 承認依頼通知 ---');
  try {
    await sendTestMessage(
      '📋 承認依頼（テスト）',
      `**高橋三郎** さんから承認依頼が届きました。

**件名**: 経費精算申請 - 出張交通費
**ステップ**: 課長承認

内容を確認し、承認または却下してください。

⚠️ これはテストメッセージです。`,
      'blue'
    );
    console.log('  ✅ 承認依頼通知を送信しました\n');
  } catch (err) {
    console.log('  ❌ 送信エラー:', (err as Error).message);
    console.log('');
  }

  // テスト2: 承認完了通知
  console.log('--- テスト2: 承認完了通知 ---');
  try {
    await sendTestMessage(
      '✅ 承認完了（テスト）',
      `申請「**経費精算申請 - 出張交通費**」が承認されました。

⚠️ これはテストメッセージです。`,
      'green'
    );
    console.log('  ✅ 承認完了通知を送信しました\n');
  } catch (err) {
    console.log('  ❌ 送信エラー:', (err as Error).message);
    console.log('');
  }

  // テスト3: 却下通知
  console.log('--- テスト3: 却下通知 ---');
  try {
    await sendTestMessage(
      '❌ 申請却下（テスト）',
      `申請「**経費精算申請 - 出張交通費**」が **佐藤花子** さんにより却下されました。

**コメント**: 領収書が添付されていません。再提出をお願いします。

⚠️ これはテストメッセージです。`,
      'red'
    );
    console.log('  ✅ 却下通知を送信しました\n');
  } catch (err) {
    console.log('  ❌ 送信エラー:', (err as Error).message);
    console.log('');
  }

  // テスト4: リマインダー通知
  console.log('--- テスト4: リマインダー通知 ---');
  try {
    await sendTestMessage(
      '⏰ 承認リマインダー（テスト）',
      `**高橋三郎** さんの申請「**経費精算申請 - 出張交通費**」が **3日間** 承認待ちです。

ご確認をお願いします。

⚠️ これはテストメッセージです。`,
      'orange'
    );
    console.log('  ✅ リマインダー通知を送信しました\n');
  } catch (err) {
    console.log('  ❌ 送信エラー:', (err as Error).message);
    console.log('');
  }

  console.log('============================================================');
  console.log('✨ テスト完了');
  console.log('============================================================');
}

main().catch(console.error);
