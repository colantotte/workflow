import { getLarkClient } from './client.js';
import type { Request, ResolvedApprovalStep } from '../models/index.js';
import {
  createApprovalRequestCard,
  createApprovalCompleteCard,
  createRejectionCard,
  createRemandCard,
} from './cards.js';

export class LarkBot {
  /**
   * ユーザーにメッセージを送信
   */
  async sendMessage(
    userId: string,
    content: {
      title: string;
      text: string;
      actions?: { text: string; url: string }[];
    }
  ): Promise<void> {
    const client = getLarkClient();

    // インタラクティブカード形式で送信
    const card = {
      config: {
        wide_screen_mode: true,
      },
      header: {
        title: {
          tag: 'plain_text',
          content: content.title,
        },
        template: 'blue',
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: content.text,
          },
        },
        ...(content.actions?.length
          ? [
              {
                tag: 'action',
                actions: content.actions.map((action) => ({
                  tag: 'button',
                  text: {
                    tag: 'plain_text',
                    content: action.text,
                  },
                  type: 'primary',
                  url: action.url,
                })),
              },
            ]
          : []),
      ],
    };

    await client.im.v1.message.create({
      params: {
        receive_id_type: 'user_id',
      },
      data: {
        receive_id: userId,
        msg_type: 'interactive',
        content: JSON.stringify(card),
      },
    });
  }

  /**
   * 承認依頼通知を送信
   */
  async sendApprovalRequest(
    approverLarkUserId: string,
    request: Request,
    step: ResolvedApprovalStep,
    applicantName: string,
    detailUrl: string
  ): Promise<void> {
    await this.sendMessage(approverLarkUserId, {
      title: '📋 承認依頼',
      text: `**${applicantName}** さんから承認依頼が届きました。

**件名**: ${request.title}
**ステップ**: ${step.label ?? `ステップ ${step.stepOrder}`}

内容を確認し、承認または却下してください。`,
      actions: [
        { text: '詳細を確認', url: detailUrl },
      ],
    });
  }

  /**
   * 承認完了通知を送信
   */
  async sendApprovalComplete(
    applicantLarkUserId: string,
    request: Request,
    detailUrl: string
  ): Promise<void> {
    await this.sendMessage(applicantLarkUserId, {
      title: '✅ 承認完了',
      text: `申請「**${request.title}**」が承認されました。`,
      actions: [
        { text: '詳細を確認', url: detailUrl },
      ],
    });
  }

  /**
   * 却下通知を送信
   */
  async sendRejectionNotice(
    applicantLarkUserId: string,
    request: Request,
    rejectorName: string,
    comment: string | null,
    detailUrl: string
  ): Promise<void> {
    await this.sendMessage(applicantLarkUserId, {
      title: '❌ 申請却下',
      text: `申請「**${request.title}**」が **${rejectorName}** さんにより却下されました。

${comment ? `**コメント**: ${comment}` : ''}`,
      actions: [
        { text: '詳細を確認', url: detailUrl },
      ],
    });
  }

  /**
   * 差戻し通知を送信
   */
  async sendRemandNotice(
    applicantLarkUserId: string,
    request: Request,
    remandedByName: string,
    comment: string | null,
    detailUrl: string
  ): Promise<void> {
    await this.sendMessage(applicantLarkUserId, {
      title: '↩️ 差戻し',
      text: `申請「**${request.title}**」が **${remandedByName}** さんにより差し戻されました。

${comment ? `**コメント**: ${comment}` : ''}

内容を修正して再提出してください。`,
      actions: [
        { text: '詳細を確認', url: detailUrl },
      ],
    });
  }

  /**
   * リマインダー通知を送信
   */
  async sendReminder(
    approverLarkUserId: string,
    request: Request,
    applicantName: string,
    daysWaiting: number,
    detailUrl: string
  ): Promise<void> {
    await this.sendMessage(approverLarkUserId, {
      title: '⏰ 承認リマインダー',
      text: `**${applicantName}** さんの申請「**${request.title}**」が **${daysWaiting}日間** 承認待ちです。

ご確認をお願いします。`,
      actions: [
        { text: '詳細を確認', url: detailUrl },
      ],
    });
  }
}

// シングルトンインスタンス
let botInstance: LarkBot | null = null;

function getBot(): LarkBot {
  if (!botInstance) {
    botInstance = new LarkBot();
  }
  return botInstance;
}

// ヘルパー関数（Interactive Card版）
export async function sendApprovalNotification(
  larkUserId: string,
  options: {
    requestId: string;
    requestTitle: string;
    applicantName: string;
    stepLabel: string;
    stepOrder?: number;
    content?: Record<string, unknown>;
    workflowCategory?: string;
  }
): Promise<void> {
  const client = getLarkClient();
  const card = createApprovalRequestCard({
    requestId: options.requestId,
    requestTitle: options.requestTitle,
    applicantName: options.applicantName,
    stepLabel: options.stepLabel,
    stepOrder: options.stepOrder ?? 1,
    content: options.content,
    workflowCategory: options.workflowCategory,
  });

  await client.im.v1.message.create({
    params: { receive_id_type: 'user_id' },
    data: {
      receive_id: larkUserId,
      msg_type: 'interactive',
      content: JSON.stringify(card),
    },
  });
}

export async function sendRequestStatusNotification(
  larkUserId: string,
  options: {
    requestId: string;
    requestTitle: string;
    status: 'approved' | 'rejected' | 'remanded';
    comment?: string;
    approverName?: string;
  }
): Promise<void> {
  const client = getLarkClient();
  let card: object;

  switch (options.status) {
    case 'approved':
      card = createApprovalCompleteCard({
        requestId: options.requestId,
        requestTitle: options.requestTitle,
        approverName: options.approverName ?? '',
      });
      break;
    case 'rejected':
      card = createRejectionCard({
        requestId: options.requestId,
        requestTitle: options.requestTitle,
        rejectorName: options.approverName ?? '',
        comment: options.comment,
      });
      break;
    case 'remanded':
      card = createRemandCard({
        requestId: options.requestId,
        requestTitle: options.requestTitle,
        remandedByName: options.approverName ?? '',
        comment: options.comment,
      });
      break;
  }

  await client.im.v1.message.create({
    params: { receive_id_type: 'user_id' },
    data: {
      receive_id: larkUserId,
      msg_type: 'interactive',
      content: JSON.stringify(card),
    },
  });
}
