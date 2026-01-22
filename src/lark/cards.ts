/**
 * Lark Interactive Card Templates
 * カード内ボタンでアクションを実行可能
 */

export interface CardAction {
  tag: 'button';
  text: { tag: 'plain_text'; content: string };
  type: 'primary' | 'danger' | 'default';
  value: Record<string, string>;
}

/**
 * 承認依頼カード（承認/却下/差戻しボタン付き）
 */
export function createApprovalRequestCard(params: {
  requestId: string;
  requestTitle: string;
  applicantName: string;
  stepLabel: string;
  stepOrder: number;
  content?: Record<string, unknown>;
  workflowCategory?: string;
}) {
  const contentLines: string[] = [];

  // フォーム内容を表示
  if (params.content && Object.keys(params.content).length > 0) {
    Object.entries(params.content).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        const label = getFieldLabel(key);
        contentLines.push(`**${label}**: ${formatValue(value)}`);
      }
    });
  }

  return {
    config: {
      wide_screen_mode: true,
      update_multi: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: '📋 承認依頼',
      },
      template: 'orange',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${params.applicantName}** さんから承認依頼が届きました。`,
        },
      },
      {
        tag: 'hr',
      },
      {
        tag: 'div',
        fields: [
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**件名**\n${params.requestTitle}`,
            },
          },
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**承認ステップ**\n${params.stepLabel}`,
            },
          },
        ],
      },
      ...(contentLines.length > 0
        ? [
            {
              tag: 'hr',
            },
            {
              tag: 'div',
              text: {
                tag: 'lark_md',
                content: contentLines.join('\n'),
              },
            },
          ]
        : []),
      {
        tag: 'hr',
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: '✓ 承認',
            },
            type: 'primary',
            value: {
              action: 'approve',
              request_id: params.requestId,
              step_order: String(params.stepOrder),
            },
          },
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: '✗ 却下',
            },
            type: 'danger',
            value: {
              action: 'reject',
              request_id: params.requestId,
              step_order: String(params.stepOrder),
            },
          },
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: '↩ 差戻し',
            },
            type: 'default',
            value: {
              action: 'remand',
              request_id: params.requestId,
              step_order: String(params.stepOrder),
            },
          },
        ],
      },
      {
        tag: 'note',
        elements: [
          {
            tag: 'plain_text',
            content: '却下・差戻しの場合はコメント入力画面が表示されます',
          },
        ],
      },
    ],
  };
}

/**
 * コメント入力カード（却下/差戻し用）
 */
export function createCommentInputCard(params: {
  requestId: string;
  requestTitle: string;
  action: 'reject' | 'remand';
  stepOrder: number;
}) {
  const actionLabel = params.action === 'reject' ? '却下' : '差戻し';
  const headerColor = params.action === 'reject' ? 'red' : 'orange';

  return {
    config: {
      wide_screen_mode: true,
      update_multi: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: params.action === 'reject' ? '❌ 却下理由入力' : '↩️ 差戻し理由入力',
      },
      template: headerColor,
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `申請「**${params.requestTitle}**」を${actionLabel}します。\n\n理由を入力してください：`,
        },
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'input',
            name: 'comment',
            placeholder: {
              tag: 'plain_text',
              content: `${actionLabel}理由を入力...`,
            },
          } as unknown as CardAction,
        ],
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: `${actionLabel}を確定`,
            },
            type: params.action === 'reject' ? 'danger' : 'default',
            value: {
              action: `confirm_${params.action}`,
              request_id: params.requestId,
              step_order: String(params.stepOrder),
            },
          },
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: 'キャンセル',
            },
            type: 'default',
            value: {
              action: 'cancel',
              request_id: params.requestId,
            },
          },
        ],
      },
    ],
  };
}

/**
 * 処理完了カード（承認済み）
 */
export function createApprovalCompleteCard(params: {
  requestId: string;
  requestTitle: string;
  approverName: string;
}) {
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: '✅ 承認完了',
      },
      template: 'green',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `申請「**${params.requestTitle}**」が承認されました。\n\n全ての承認が完了しました。`,
        },
      },
    ],
  };
}

/**
 * 次のステップへ進んだカード
 */
export function createNextStepCard(params: {
  requestId: string;
  requestTitle: string;
  nextStepLabel: string;
  nextApproverName: string;
}) {
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: '✓ 承認しました',
      },
      template: 'green',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `申請「**${params.requestTitle}**」を承認しました。\n\n次のステップ「**${params.nextStepLabel}**」へ進みます。\n承認者: **${params.nextApproverName}**`,
        },
      },
    ],
  };
}

/**
 * 却下完了カード
 */
export function createRejectionCard(params: {
  requestId: string;
  requestTitle: string;
  rejectorName: string;
  comment?: string;
}) {
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: '❌ 申請却下',
      },
      template: 'red',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `申請「**${params.requestTitle}**」が **${params.rejectorName}** さんにより却下されました。${params.comment ? `\n\n**理由**: ${params.comment}` : ''}`,
        },
      },
    ],
  };
}

/**
 * 差戻しカード
 */
export function createRemandCard(params: {
  requestId: string;
  requestTitle: string;
  remandedByName: string;
  comment?: string;
}) {
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: '↩️ 差戻し',
      },
      template: 'orange',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `申請「**${params.requestTitle}**」が **${params.remandedByName}** さんにより差し戻されました。${params.comment ? `\n\n**理由**: ${params.comment}` : ''}\n\n内容を修正して再提出してください。`,
        },
      },
    ],
  };
}

/**
 * 申請作成確認カード
 */
export function createRequestCreatedCard(params: {
  requestId: string;
  requestTitle: string;
  workflowName: string;
  firstApproverName?: string;
}) {
  return {
    config: {
      wide_screen_mode: true,
      update_multi: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: '📝 申請を作成しました',
      },
      template: 'blue',
    },
    elements: [
      {
        tag: 'div',
        fields: [
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**件名**\n${params.requestTitle}`,
            },
          },
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**ワークフロー**\n${params.workflowName}`,
            },
          },
        ],
      },
      {
        tag: 'hr',
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: '提出する',
            },
            type: 'primary',
            value: {
              action: 'submit',
              request_id: params.requestId,
            },
          },
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: '下書き保存',
            },
            type: 'default',
            value: {
              action: 'save_draft',
              request_id: params.requestId,
            },
          },
        ],
      },
      ...(params.firstApproverName
        ? [
            {
              tag: 'note',
              elements: [
                {
                  tag: 'plain_text',
                  content: `提出後、${params.firstApproverName} さんに承認依頼が送られます`,
                },
              ],
            },
          ]
        : []),
    ],
  };
}

/**
 * 承認待ち一覧カード
 */
export function createPendingListCard(params: {
  requests: Array<{
    id: string;
    title: string;
    applicantName: string;
    submittedAt: string;
  }>;
}) {
  if (params.requests.length === 0) {
    return {
      config: {
        wide_screen_mode: true,
      },
      header: {
        title: {
          tag: 'plain_text',
          content: '📋 承認待ち一覧',
        },
        template: 'blue',
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: '承認待ちの申請はありません。',
          },
        },
      ],
    };
  }

  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: `📋 承認待ち一覧（${params.requests.length}件）`,
      },
      template: 'orange',
    },
    elements: params.requests.flatMap((req, index) => [
      ...(index > 0 ? [{ tag: 'hr' as const }] : []),
      {
        tag: 'div' as const,
        text: {
          tag: 'lark_md' as const,
          content: `**${req.title}**\n申請者: ${req.applicantName} | ${req.submittedAt}`,
        },
      },
      {
        tag: 'action' as const,
        actions: [
          {
            tag: 'button' as const,
            text: {
              tag: 'plain_text' as const,
              content: '✓ 承認',
            },
            type: 'primary' as const,
            value: {
              action: 'approve',
              request_id: req.id,
            },
          },
          {
            tag: 'button' as const,
            text: {
              tag: 'plain_text' as const,
              content: '詳細',
            },
            type: 'default' as const,
            value: {
              action: 'view_detail',
              request_id: req.id,
            },
          },
        ],
      },
    ]),
  };
}

// ヘルパー関数
function getFieldLabel(key: string): string {
  const labels: Record<string, string> = {
    amount: '金額',
    expenseDate: '支出日',
    category: '経費区分',
    description: '内容・目的',
    receipt: '領収書添付',
    leaveType: '休暇種別',
    startDate: '開始日',
    endDate: '終了日',
    reason: '理由',
    purpose: '目的',
    detail: '詳細',
    deadline: '希望期日',
  };
  return labels[key] || key;
}

function formatValue(value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? 'あり' : 'なし';
  }
  if (typeof value === 'number') {
    return value.toLocaleString('ja-JP');
  }
  if (value instanceof Date) {
    return value.toLocaleDateString('ja-JP');
  }
  return String(value);
}
