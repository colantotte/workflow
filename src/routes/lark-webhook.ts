import { Hono } from 'hono';
import { getLarkClient } from '../lark/client.js';
import { getRepository } from '../repositories/lark-base.repository.js';
import { ApprovalService, type DataStore } from '../services/approval.service.js';
import {
  createApprovalRequestCard,
  createApprovalCompleteCard,
  createNextStepCard,
  createRejectionCard,
  createRemandCard,
  createCommentInputCard,
  createPendingListCard,
} from '../lark/cards.js';

export const larkWebhookRoutes = new Hono();

// DataStore実装
function createDataStore(): DataStore {
  const repo = getRepository();
  return {
    getUser: (id) => repo.getUser(id),
    getUserByLarkId: (larkUserId) => repo.getUserByLarkId(larkUserId),
    getUserPositions: (userId) => repo.getUserPositions(userId),
    getUserApprovalRoles: (userId) => repo.getUserApprovalRoles(userId),
    getOrganization: (id) => repo.getOrganization(id),
    getPosition: (id) => repo.getPosition(id),
    getUsersByOrganizationAndPosition: (orgId, posId) =>
      repo.getUsersByOrganizationAndPosition(orgId, posId),
    getUsersByApprovalRole: (roleId) => repo.getUsersByApprovalRole(roleId),
    getWorkflowWithSteps: (workflowId) => repo.getWorkflowWithSteps(workflowId),
    getApprovalHistory: (requestId) => repo.getApprovalHistory(requestId),
  };
}

/**
 * Lark Event Webhook
 * - Card action callbacks
 * - Bot messages
 */
larkWebhookRoutes.post('/event', async (c) => {
  const body = await c.req.json();

  // URL Verification (初回設定時)
  if (body.type === 'url_verification') {
    return c.json({ challenge: body.challenge });
  }

  // Event callback
  if (body.header?.event_type === 'card.action.trigger') {
    return handleCardAction(c, body);
  }

  // Message event (Bot commands)
  if (body.header?.event_type === 'im.message.receive_v1') {
    return handleMessage(c, body);
  }

  return c.json({ code: 0 });
});

/**
 * カードアクション処理
 */
async function handleCardAction(c: any, body: any) {
  const action = body.event?.action;
  const value = action?.value || {};
  const operatorId = body.event?.operator?.user_id;
  const messageId = body.event?.context?.open_message_id;

  console.log('Card action:', { value, operatorId });

  try {
    const repo = getRepository();
    const client = getLarkClient();

    switch (value.action) {
      case 'approve':
        await handleApprove(repo, client, {
          requestId: value.request_id,
          approverId: operatorId,
          messageId,
        });
        break;

      case 'reject':
      case 'remand':
        // コメント入力カードに更新
        const request = await repo.getRequest(value.request_id);
        if (request) {
          const commentCard = createCommentInputCard({
            requestId: value.request_id,
            requestTitle: request.title,
            action: value.action,
            stepOrder: Number(value.step_order),
          });
          await updateCard(client, messageId, commentCard);
        }
        break;

      case 'confirm_reject':
        await handleReject(repo, client, {
          requestId: value.request_id,
          approverId: operatorId,
          comment: body.event?.action?.form_value?.comment || '',
          messageId,
        });
        break;

      case 'confirm_remand':
        await handleRemand(repo, client, {
          requestId: value.request_id,
          approverId: operatorId,
          comment: body.event?.action?.form_value?.comment || '',
          messageId,
        });
        break;

      case 'cancel':
        // 元のカードに戻す
        const reqForCancel = await repo.getRequest(value.request_id);
        if (reqForCancel) {
          const applicant = await repo.getUser(reqForCancel.applicantId);
          const workflow = await repo.getWorkflowWithSteps(reqForCancel.workflowId);
          const currentStep = workflow?.steps.find((s) => s.stepOrder === reqForCancel.currentStep);
          const originalCard = createApprovalRequestCard({
            requestId: reqForCancel.id,
            requestTitle: reqForCancel.title,
            applicantName: applicant?.name || '不明',
            stepLabel: currentStep?.label || `ステップ ${reqForCancel.currentStep}`,
            stepOrder: reqForCancel.currentStep,
            content: reqForCancel.content,
            workflowCategory: workflow?.category,
          });
          await updateCard(client, messageId, originalCard);
        }
        break;

      case 'submit':
        await handleSubmit(repo, client, {
          requestId: value.request_id,
          userId: operatorId,
          messageId,
        });
        break;

      case 'view_detail':
        await handleViewDetail(repo, client, {
          requestId: value.request_id,
          userId: operatorId,
        });
        break;
    }

    return c.json({ code: 0 });
  } catch (error) {
    console.error('Card action error:', error);
    return c.json({ code: 0 }); // Larkには常に200を返す
  }
}

/**
 * 承認処理
 */
async function handleApprove(
  repo: ReturnType<typeof getRepository>,
  client: ReturnType<typeof getLarkClient>,
  params: { requestId: string; approverId: string; messageId: string }
) {
  const request = await repo.getRequest(params.requestId);
  if (!request || request.status !== 'pending') return;

  const approver = await repo.getUserByLarkId(params.approverId);
  if (!approver) return;

  // 承認履歴を記録
  await repo.createApprovalHistory({
    requestId: params.requestId,
    stepOrder: request.currentStep,
    approverId: approver.id,
    action: 'approve',
  });

  // 次のステップを決定
  const workflow = await repo.getWorkflowWithSteps(request.workflowId);
  const applicant = await repo.getUser(request.applicantId);
  const applicantOrg = await repo.getOrganization(request.applicantOrganizationId);

  if (!workflow || !applicant || !applicantOrg) return;

  const dataStore = createDataStore();
  const approvalService = new ApprovalService(dataStore);

  let nextStep = request.currentStep + 1;
  const maxStep = workflow.steps.length;

  if (nextStep > maxStep) {
    // 全ステップ完了
    await repo.updateRequest(params.requestId, {
      status: 'approved',
      completedAt: new Date(),
    });

    // カードを更新
    const completeCard = createApprovalCompleteCard({
      requestId: params.requestId,
      requestTitle: request.title,
      approverName: approver.name,
    });
    await updateCard(client, params.messageId, completeCard);

    // 申請者に通知
    if (applicant.larkUserId) {
      await sendCard(client, applicant.larkUserId, completeCard);
    }
    return;
  }

  // 次のステップに進む
  const updatedRequest = await repo.updateRequest(params.requestId, { currentStep: nextStep });

  // 承認ルートを解決
  const route = await approvalService.resolveApprovalRoute({
    request: updatedRequest,
    applicant,
    applicantOrganization: applicantOrg,
    workflow,
    currentDate: new Date(),
  });

  // スキップ処理
  for (let i = nextStep - 1; i < route.length; i++) {
    const step = route[i];
    if (step.status === 'skipped') {
      await repo.createApprovalHistory({
        requestId: params.requestId,
        stepOrder: step.stepOrder,
        approverId: step.approver?.id ?? '',
        action: 'skip',
        skipReason: step.skipReason ?? undefined,
      });
      nextStep++;
    } else if (step.status === 'pending') {
      break;
    }
  }

  // 完了チェック（スキップ後）
  if (nextStep > maxStep) {
    await repo.updateRequest(params.requestId, {
      status: 'approved',
      currentStep: nextStep,
      completedAt: new Date(),
    });

    const completeCard = createApprovalCompleteCard({
      requestId: params.requestId,
      requestTitle: request.title,
      approverName: approver.name,
    });
    await updateCard(client, params.messageId, completeCard);

    if (applicant.larkUserId) {
      await sendCard(client, applicant.larkUserId, completeCard);
    }
    return;
  }

  // 次のステップの承認者に通知
  await repo.updateRequest(params.requestId, { currentStep: nextStep });
  const nextStepInfo = route.find((s) => s.stepOrder === nextStep);

  if (nextStepInfo?.approver) {
    const nextApprover = await repo.getUser(nextStepInfo.approver.id);

    // 現在のカードを更新
    const progressCard = createNextStepCard({
      requestId: params.requestId,
      requestTitle: request.title,
      nextStepLabel: nextStepInfo.label ?? `ステップ ${nextStep}`,
      nextApproverName: nextApprover?.name || '次の承認者',
    });
    await updateCard(client, params.messageId, progressCard);

    // 次の承認者に通知
    if (nextApprover?.larkUserId) {
      const approvalCard = createApprovalRequestCard({
        requestId: params.requestId,
        requestTitle: request.title,
        applicantName: applicant.name,
        stepLabel: nextStepInfo.label ?? `ステップ ${nextStep}`,
        stepOrder: nextStep,
        content: request.content,
        workflowCategory: workflow.category,
      });
      await sendCard(client, nextApprover.larkUserId, approvalCard);
    }
  }
}

/**
 * 却下処理
 */
async function handleReject(
  repo: ReturnType<typeof getRepository>,
  client: ReturnType<typeof getLarkClient>,
  params: { requestId: string; approverId: string; comment: string; messageId: string }
) {
  const request = await repo.getRequest(params.requestId);
  if (!request || request.status !== 'pending') return;

  const approver = await repo.getUserByLarkId(params.approverId);
  if (!approver) return;

  // 承認履歴を記録
  await repo.createApprovalHistory({
    requestId: params.requestId,
    stepOrder: request.currentStep,
    approverId: approver.id,
    action: 'reject',
    comment: params.comment,
  });

  // ステータスを更新
  await repo.updateRequest(params.requestId, {
    status: 'rejected',
    completedAt: new Date(),
  });

  // カードを更新
  const rejectCard = createRejectionCard({
    requestId: params.requestId,
    requestTitle: request.title,
    rejectorName: approver.name,
    comment: params.comment,
  });
  await updateCard(client, params.messageId, rejectCard);

  // 申請者に通知
  const applicant = await repo.getUser(request.applicantId);
  if (applicant?.larkUserId) {
    await sendCard(client, applicant.larkUserId, rejectCard);
  }
}

/**
 * 差戻し処理
 */
async function handleRemand(
  repo: ReturnType<typeof getRepository>,
  client: ReturnType<typeof getLarkClient>,
  params: { requestId: string; approverId: string; comment: string; messageId: string }
) {
  const request = await repo.getRequest(params.requestId);
  if (!request || request.status !== 'pending') return;

  const approver = await repo.getUserByLarkId(params.approverId);
  if (!approver) return;

  // 承認履歴を記録
  await repo.createApprovalHistory({
    requestId: params.requestId,
    stepOrder: request.currentStep,
    approverId: approver.id,
    action: 'remand',
    comment: params.comment,
  });

  // ステータスを下書きに戻す
  await repo.updateRequest(params.requestId, {
    status: 'draft',
    currentStep: 0,
  });

  // カードを更新
  const remandCard = createRemandCard({
    requestId: params.requestId,
    requestTitle: request.title,
    remandedByName: approver.name,
    comment: params.comment,
  });
  await updateCard(client, params.messageId, remandCard);

  // 申請者に通知
  const applicant = await repo.getUser(request.applicantId);
  if (applicant?.larkUserId) {
    await sendCard(client, applicant.larkUserId, remandCard);
  }
}

/**
 * 申請提出処理
 */
async function handleSubmit(
  repo: ReturnType<typeof getRepository>,
  client: ReturnType<typeof getLarkClient>,
  params: { requestId: string; userId: string; messageId: string }
) {
  const request = await repo.getRequest(params.requestId);
  if (!request || request.status !== 'draft') return;

  const workflow = await repo.getWorkflowWithSteps(request.workflowId);
  const applicant = await repo.getUser(request.applicantId);
  const applicantOrg = await repo.getOrganization(request.applicantOrganizationId);

  if (!workflow || !applicant || !applicantOrg) return;

  // ステータスを更新
  await repo.updateRequest(params.requestId, {
    status: 'pending',
    currentStep: 1,
    submittedAt: new Date(),
  });

  // 承認ルートを解決
  const dataStore = createDataStore();
  const approvalService = new ApprovalService(dataStore);
  const updatedRequest = await repo.getRequest(params.requestId);
  if (!updatedRequest) return;

  const route = await approvalService.resolveApprovalRoute({
    request: updatedRequest,
    applicant,
    applicantOrganization: applicantOrg,
    workflow,
    currentDate: new Date(),
  });

  // 最初の承認者を特定
  const firstStep = route.find((s) => s.status === 'pending');
  if (firstStep?.approver) {
    const firstApprover = await repo.getUser(firstStep.approver.id);
    if (firstApprover?.larkUserId) {
      const approvalCard = createApprovalRequestCard({
        requestId: params.requestId,
        requestTitle: request.title,
        applicantName: applicant.name,
        stepLabel: firstStep.label ?? 'ステップ 1',
        stepOrder: firstStep.stepOrder,
        content: request.content,
        workflowCategory: workflow.category,
      });
      await sendCard(client, firstApprover.larkUserId, approvalCard);
    }
  }
}

/**
 * 詳細表示処理
 */
async function handleViewDetail(
  repo: ReturnType<typeof getRepository>,
  client: ReturnType<typeof getLarkClient>,
  params: { requestId: string; userId: string }
) {
  const request = await repo.getRequest(params.requestId);
  if (!request) return;

  const applicant = await repo.getUser(request.applicantId);
  const workflow = await repo.getWorkflowWithSteps(request.workflowId);
  const currentStep = workflow?.steps.find((s) => s.stepOrder === request.currentStep);

  // 詳細カードを送信
  const detailCard = createApprovalRequestCard({
    requestId: request.id,
    requestTitle: request.title,
    applicantName: applicant?.name || '不明',
    stepLabel: currentStep?.label || `ステップ ${request.currentStep}`,
    stepOrder: request.currentStep,
    content: request.content,
    workflowCategory: workflow?.category,
  });

  await sendCard(client, params.userId, detailCard);
}

/**
 * Botメッセージ処理
 */
async function handleMessage(c: any, body: any) {
  const message = body.event?.message;
  const senderId = body.event?.sender?.sender_id?.user_id;
  const content = JSON.parse(message?.content || '{}');
  const text = content.text?.trim() || '';

  console.log('Bot message:', { text, senderId });

  const repo = getRepository();
  const client = getLarkClient();
  const user = await repo.getUserByLarkId(senderId);

  // コマンド処理
  if (text === '/pending' || text === '承認待ち' || text === '一覧') {
    await handlePendingCommand(repo, client, senderId, user?.id);
  } else if (text === '/help' || text === 'ヘルプ') {
    await sendHelpMessage(client, senderId);
  } else if (text.startsWith('/new') || text.startsWith('申請')) {
    await sendNewRequestGuide(client, senderId);
  }

  return c.json({ code: 0 });
}

/**
 * 承認待ち一覧コマンド
 */
async function handlePendingCommand(
  repo: ReturnType<typeof getRepository>,
  client: ReturnType<typeof getLarkClient>,
  larkUserId: string,
  userId?: string
) {
  if (!userId) {
    await sendTextMessage(client, larkUserId, 'ユーザーが登録されていません。管理者にお問い合わせください。');
    return;
  }

  const requests = await repo.listRequests({ status: 'pending' });
  const pendingForUser: Array<{
    id: string;
    title: string;
    applicantName: string;
    submittedAt: string;
  }> = [];

  for (const request of requests) {
    // TODO: 承認者チェックの実装（簡易版では全てのpending申請を表示）
    const applicant = await repo.getUser(request.applicantId);
    pendingForUser.push({
      id: request.id,
      title: request.title,
      applicantName: applicant?.name || '不明',
      submittedAt: request.submittedAt
        ? new Date(request.submittedAt).toLocaleDateString('ja-JP')
        : '-',
    });
  }

  const card = createPendingListCard({ requests: pendingForUser });
  await sendCard(client, larkUserId, card);
}

/**
 * ヘルプメッセージ送信
 */
async function sendHelpMessage(
  client: ReturnType<typeof getLarkClient>,
  larkUserId: string
) {
  const helpCard = {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '📖 ヘルプ' },
      template: 'blue',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**利用可能なコマンド:**

• **承認待ち** or **/pending** - 承認待ち一覧を表示
• **ヘルプ** or **/help** - このヘルプを表示
• **申請** or **/new** - 新規申請の作成方法

**承認操作:**
承認依頼カードの各ボタンをタップしてください。
• ✓ 承認 - 申請を承認
• ✗ 却下 - 申請を却下（理由入力）
• ↩ 差戻し - 申請を差し戻し（理由入力）`,
        },
      },
    ],
  };

  await sendCard(client, larkUserId, helpCard);
}

/**
 * 新規申請ガイド送信
 */
async function sendNewRequestGuide(
  client: ReturnType<typeof getLarkClient>,
  larkUserId: string
) {
  const guideCard = {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '📝 新規申請の作成' },
      template: 'blue',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `新規申請は **Lark Base** から作成できます。

**手順:**
1. Lark Base の「申請」テーブルを開く
2. 新しいレコードを追加
3. 必要項目を入力
4. ステータスを「pending」に変更して保存

保存後、自動的に承認者に通知が送られます。`,
        },
      },
    ],
  };

  await sendCard(client, larkUserId, guideCard);
}

// ヘルパー関数
async function sendCard(
  client: ReturnType<typeof getLarkClient>,
  userId: string,
  card: object
) {
  await client.im.v1.message.create({
    params: { receive_id_type: 'user_id' },
    data: {
      receive_id: userId,
      msg_type: 'interactive',
      content: JSON.stringify(card),
    },
  });
}

async function updateCard(
  client: ReturnType<typeof getLarkClient>,
  messageId: string,
  card: object
) {
  await client.im.v1.message.patch({
    path: { message_id: messageId },
    data: {
      content: JSON.stringify(card),
    },
  });
}

async function sendTextMessage(
  client: ReturnType<typeof getLarkClient>,
  userId: string,
  text: string
) {
  await client.im.v1.message.create({
    params: { receive_id_type: 'user_id' },
    data: {
      receive_id: userId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    },
  });
}
