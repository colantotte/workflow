import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { CreateRequestSchema, RequestStatus } from '../models/index.js';
import { getRepository } from '../repositories/lark-base.repository.js';
import { ApprovalService, type DataStore } from '../services/approval.service.js';
import { sendApprovalNotification, sendRequestStatusNotification } from '../lark/bot.js';

export const requestRoutes = new Hono();

// DataStore実装（リポジトリをラップ）
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

// 申請一覧取得
requestRoutes.get('/', async (c) => {
  const status = c.req.query('status') as RequestStatus | undefined;
  const applicantId = c.req.query('applicantId');
  const workflowId = c.req.query('workflowId');

  const repo = getRepository();
  const requests = await repo.listRequests({ status, applicantId, workflowId });
  return c.json({ requests, total: requests.length });
});

// 承認待ち申請一覧（簡易版・高速）
requestRoutes.get('/pending', async (c) => {
  const approverId = c.req.query('approverId');
  if (!approverId) {
    return c.json({ error: 'approverId query required' }, 400);
  }

  const repo = getRepository();
  const dataStore = createDataStore();
  const approvalService = new ApprovalService(dataStore);

  // pending状態の申請を取得
  const pendingRequests = await repo.listRequests({ status: 'pending' });

  // 並列で処理して高速化
  const results = await Promise.all(
    pendingRequests.map(async (request) => {
      try {
        const [workflow, applicant, applicantOrg] = await Promise.all([
          repo.getWorkflowWithSteps(request.workflowId),
          repo.getUser(request.applicantId),
          repo.getOrganization(request.applicantOrganizationId),
        ]);

        if (!workflow || !applicant || !applicantOrg) return null;

        const route = await approvalService.resolveApprovalRoute({
          request,
          applicant,
          applicantOrganization: applicantOrg,
          workflow,
          currentDate: new Date(),
        });

        const currentStepInfo = route.find(
          (step) => step.stepOrder === request.currentStep && step.status === 'pending'
        );

        if (currentStepInfo?.approver?.id === approverId) {
          return {
            ...request,
            applicantName: applicant.name,
            workflowName: workflow.name,
          };
        }
        return null;
      } catch {
        return null;
      }
    })
  );

  const requests = results.filter((r): r is NonNullable<typeof r> => r !== null);
  return c.json({ requests, total: requests.length });
});

// 自分の承認待ち申請一覧
requestRoutes.get('/pending-approval', async (c) => {
  const userId = c.req.header('X-User-Id');
  if (!userId) {
    return c.json({ error: 'X-User-Id header required' }, 400);
  }

  const repo = getRepository();
  const dataStore = createDataStore();
  const approvalService = new ApprovalService(dataStore);

  // pending状態の全申請を取得
  const allRequests = await repo.listRequests({ status: 'pending' });
  const pendingForUser = [];

  for (const request of allRequests) {
    const workflow = await repo.getWorkflowWithSteps(request.workflowId);
    const applicant = await repo.getUser(request.applicantId);
    const applicantOrg = await repo.getOrganization(request.applicantOrganizationId);

    if (workflow && applicant && applicantOrg) {
      const route = await approvalService.resolveApprovalRoute({
        request,
        applicant,
        applicantOrganization: applicantOrg,
        workflow,
        currentDate: new Date(),
      });

      // 現在のステップで自分が承認者かチェック
      const currentStepInfo = route.find(
        (step) => step.stepOrder === request.currentStep && step.status === 'pending'
      );
      if (currentStepInfo?.approver?.id === userId) {
        pendingForUser.push({ request, workflow, currentStep: currentStepInfo });
      }
    }
  }

  return c.json({ requests: pendingForUser, total: pendingForUser.length });
});

// 申請詳細取得（承認ルート含む）
requestRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const repo = getRepository();
  const request = await repo.getRequest(id);

  if (!request) {
    return c.json({ error: 'Request not found' }, 404);
  }

  const workflow = await repo.getWorkflowWithSteps(request.workflowId);
  const applicant = await repo.getUser(request.applicantId);
  const applicantOrg = await repo.getOrganization(request.applicantOrganizationId);

  if (!workflow || !applicant || !applicantOrg) {
    return c.json({ error: 'Related data not found' }, 500);
  }

  // 承認ルートを解決
  const dataStore = createDataStore();
  const approvalService = new ApprovalService(dataStore);
  const route = await approvalService.resolveApprovalRoute({
    request,
    applicant,
    applicantOrganization: applicantOrg,
    workflow,
    currentDate: new Date(),
  });

  return c.json({ request, workflow, applicant, route });
});

// 申請作成（下書き）
requestRoutes.post(
  '/',
  zValidator('json', CreateRequestSchema),
  async (c) => {
    const data = c.req.valid('json');
    const repo = getRepository();

    const request = await repo.createRequest({
      workflowId: data.workflowId,
      applicantId: data.applicantId,
      applicantOrganizationId: data.applicantOrganizationId,
      title: data.title,
      content: data.content,
    });

    return c.json({ request }, 201);
  }
);

// 申請更新（下書き状態のみ）
requestRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  const repo = getRepository();

  const existing = await repo.getRequest(id);
  if (!existing) {
    return c.json({ error: 'Request not found' }, 404);
  }

  if (existing.status !== 'draft') {
    return c.json({ error: 'Can only update draft requests' }, 400);
  }

  const request = await repo.updateRequest(id, {
    title: data.title,
    content: data.content,
  });
  return c.json({ request });
});

// 承認ルート確認（スキップ反映済み）
requestRoutes.get('/:id/route', async (c) => {
  const id = c.req.param('id');
  const repo = getRepository();
  const request = await repo.getRequest(id);

  if (!request) {
    return c.json({ error: 'Request not found' }, 404);
  }

  const workflow = await repo.getWorkflowWithSteps(request.workflowId);
  const applicant = await repo.getUser(request.applicantId);
  const applicantOrg = await repo.getOrganization(request.applicantOrganizationId);

  if (!workflow || !applicant || !applicantOrg) {
    return c.json({ error: 'Related data not found' }, 500);
  }

  const dataStore = createDataStore();
  const approvalService = new ApprovalService(dataStore);
  const route = await approvalService.resolveApprovalRoute({
    request,
    applicant,
    applicantOrganization: applicantOrg,
    workflow,
    currentDate: new Date(),
  });

  return c.json({ route });
});

// 申請提出
requestRoutes.post('/:id/submit', async (c) => {
  const id = c.req.param('id');
  const repo = getRepository();

  const existing = await repo.getRequest(id);
  if (!existing) {
    return c.json({ error: 'Request not found' }, 404);
  }

  if (existing.status !== 'draft') {
    return c.json({ error: 'Can only submit draft requests' }, 400);
  }

  // 承認ルートを解決して最初のステップを決定
  const workflow = await repo.getWorkflowWithSteps(existing.workflowId);
  const applicant = await repo.getUser(existing.applicantId);
  const applicantOrg = await repo.getOrganization(existing.applicantOrganizationId);

  if (!workflow || !applicant || !applicantOrg) {
    return c.json({ error: 'Related data not found' }, 500);
  }

  const dataStore = createDataStore();
  const approvalService = new ApprovalService(dataStore);

  // ステータスを更新（currentStepは1から開始）
  const request = await repo.updateRequest(id, {
    status: 'pending',
    currentStep: 1,
    submittedAt: new Date(),
  });

  // 承認ルートを解決
  const route = await approvalService.resolveApprovalRoute({
    request,
    applicant,
    applicantOrganization: applicantOrg,
    workflow,
    currentDate: new Date(),
  });

  // スキップ処理とステップ進行
  let currentStep = 1;
  for (const step of route) {
    if (step.status === 'skipped') {
      // スキップを履歴に記録
      await repo.createApprovalHistory({
        requestId: id,
        stepOrder: step.stepOrder,
        approverId: step.approver?.id ?? '',
        action: 'skip',
        skipReason: step.skipReason ?? undefined,
      });
      currentStep++;
    } else if (step.status === 'pending') {
      break;
    }
  }

  // currentStepを更新
  const updatedRequest = await repo.updateRequest(id, { currentStep });

  // 最初の承認者に通知
  const nextStep = route.find((s) => s.stepOrder === currentStep && s.status === 'pending');
  if (nextStep?.approver) {
    const approverUser = await repo.getUser(nextStep.approver.id);
    if (approverUser?.larkUserId) {
      await sendApprovalNotification(approverUser.larkUserId, {
        requestId: id,
        requestTitle: existing.title,
        applicantName: applicant.name,
        stepLabel: nextStep.label ?? `ステップ${nextStep.stepOrder}`,
      }).catch(console.error);
    }
  }

  return c.json({ success: true, request: updatedRequest, route });
});

// 承認
requestRoutes.post(
  '/:id/approve',
  zValidator(
    'json',
    z.object({
      comment: z.string().max(1000, 'コメントは1000文字以内で入力してください').optional(),
    }),
    (result, c) => {
      if (!result.success) {
        return c.json({ error: result.error.issues[0]?.message || 'バリデーションエラー' }, 400);
      }
      return undefined;
    }
  ),
  async (c) => {
    const id = c.req.param('id');
    const { comment } = c.req.valid('json');
    const approverId = c.req.header('X-User-Id');

    if (!approverId) {
      return c.json({ error: 'X-User-Id header required' }, 400);
    }

    const repo = getRepository();
    const existing = await repo.getRequest(id);

    if (!existing) {
      return c.json({ error: 'Request not found' }, 404);
    }

    if (existing.status !== 'pending') {
      return c.json({ error: 'Request is not pending' }, 400);
    }

    // 承認履歴を記録
    await repo.createApprovalHistory({
      requestId: id,
      stepOrder: existing.currentStep,
      approverId,
      action: 'approve',
      comment: comment ?? undefined,
    });

    // 承認ルートを解決して次のステップを決定
    const workflow = await repo.getWorkflowWithSteps(existing.workflowId);
    const applicant = await repo.getUser(existing.applicantId);
    const applicantOrg = await repo.getOrganization(existing.applicantOrganizationId);

    if (!workflow || !applicant || !applicantOrg) {
      return c.json({ error: 'Related data not found' }, 500);
    }

    const dataStore = createDataStore();
    const approvalService = new ApprovalService(dataStore);

    // 次のステップを探す
    let nextStep = existing.currentStep + 1;
    const maxStep = workflow.steps.length;

    // 完了チェック
    if (nextStep > maxStep) {
      // 全ステップ完了
      const request = await repo.updateRequest(id, {
        status: 'approved',
        completedAt: new Date(),
      });

      // 申請者に完了通知
      if (applicant.larkUserId) {
        await sendRequestStatusNotification(applicant.larkUserId, {
          requestId: id,
          requestTitle: existing.title,
          status: 'approved',
        }).catch(console.error);
      }

      return c.json({ success: true, request, completed: true });
    }

    // スキップ処理
    const updatedRequest = await repo.updateRequest(id, { currentStep: nextStep });
    const route = await approvalService.resolveApprovalRoute({
      request: updatedRequest,
      applicant,
      applicantOrganization: applicantOrg,
      workflow,
      currentDate: new Date(),
    });

    // スキップすべきステップを処理
    for (let i = nextStep - 1; i < route.length; i++) {
      const step = route[i];
      if (step.status === 'skipped') {
        await repo.createApprovalHistory({
          requestId: id,
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
      const request = await repo.updateRequest(id, {
        status: 'approved',
        currentStep: nextStep,
        completedAt: new Date(),
      });

      if (applicant.larkUserId) {
        await sendRequestStatusNotification(applicant.larkUserId, {
          requestId: id,
          requestTitle: existing.title,
          status: 'approved',
        }).catch(console.error);
      }

      return c.json({ success: true, request, completed: true });
    }

    // 次のステップに進む
    const finalRequest = await repo.updateRequest(id, { currentStep: nextStep });

    // 次の承認者に通知
    const nextStepInfo = route.find((s) => s.stepOrder === nextStep);
    if (nextStepInfo?.approver) {
      const nextApprover = await repo.getUser(nextStepInfo.approver.id);
      if (nextApprover?.larkUserId) {
        await sendApprovalNotification(nextApprover.larkUserId, {
          requestId: id,
          requestTitle: existing.title,
          applicantName: applicant.name,
          stepLabel: nextStepInfo.label ?? `ステップ${nextStepInfo.stepOrder}`,
        }).catch(console.error);
      }
    }

    return c.json({ success: true, request: finalRequest, completed: false });
  }
);

// 却下
requestRoutes.post(
  '/:id/reject',
  zValidator(
    'json',
    z.object({
      comment: z.string().min(1, 'コメントは必須です').max(1000, 'コメントは1000文字以内で入力してください'),
    }),
    (result, c) => {
      if (!result.success) {
        return c.json({ error: result.error.issues[0]?.message || 'バリデーションエラー' }, 400);
      }
      return undefined;
    }
  ),
  async (c) => {
    const id = c.req.param('id');
    const { comment } = c.req.valid('json');
    const approverId = c.req.header('X-User-Id');

    if (!approverId) {
      return c.json({ error: 'X-User-Id header required' }, 400);
    }

    const repo = getRepository();
    const existing = await repo.getRequest(id);

    if (!existing) {
      return c.json({ error: 'Request not found' }, 404);
    }

    if (existing.status !== 'pending') {
      return c.json({ error: 'Request is not pending' }, 400);
    }

    // 承認履歴を記録
    await repo.createApprovalHistory({
      requestId: id,
      stepOrder: existing.currentStep,
      approverId,
      action: 'reject',
      comment,
    });

    // ステータスを却下に更新
    const request = await repo.updateRequest(id, {
      status: 'rejected',
      completedAt: new Date(),
    });

    // 申請者に通知
    const applicant = await repo.getUser(existing.applicantId);
    if (applicant?.larkUserId) {
      await sendRequestStatusNotification(applicant.larkUserId, {
        requestId: id,
        requestTitle: existing.title,
        status: 'rejected',
        comment,
      }).catch(console.error);
    }

    return c.json({ success: true, request });
  }
);

// 差戻し
requestRoutes.post(
  '/:id/remand',
  zValidator(
    'json',
    z.object({
      comment: z.string().min(1, 'コメントは必須です').max(1000, 'コメントは1000文字以内で入力してください'),
      toStep: z.number().int().min(0).optional(),
    }),
    (result, c) => {
      if (!result.success) {
        return c.json({ error: result.error.issues[0]?.message || 'バリデーションエラー' }, 400);
      }
      return undefined;
    }
  ),
  async (c) => {
    const id = c.req.param('id');
    const { comment, toStep = 0 } = c.req.valid('json');
    const approverId = c.req.header('X-User-Id');

    if (!approverId) {
      return c.json({ error: 'X-User-Id header required' }, 400);
    }

    const repo = getRepository();
    const existing = await repo.getRequest(id);

    if (!existing) {
      return c.json({ error: 'Request not found' }, 404);
    }

    if (existing.status !== 'pending') {
      return c.json({ error: 'Request is not pending' }, 400);
    }

    // 承認履歴を記録
    await repo.createApprovalHistory({
      requestId: id,
      stepOrder: existing.currentStep,
      approverId,
      action: 'remand',
      comment,
    });

    // ステータスと現在ステップを更新
    const newStatus = toStep === 0 ? 'draft' : 'pending';
    const request = await repo.updateRequest(id, {
      status: newStatus,
      currentStep: toStep,
    });

    // 申請者に通知
    const applicant = await repo.getUser(existing.applicantId);
    if (applicant?.larkUserId) {
      await sendRequestStatusNotification(applicant.larkUserId, {
        requestId: id,
        requestTitle: existing.title,
        status: 'remanded',
        comment,
      }).catch(console.error);
    }

    return c.json({ success: true, request });
  }
);

// 取消し
requestRoutes.post('/:id/cancel', async (c) => {
  const id = c.req.param('id');
  const userId = c.req.header('X-User-Id');

  const repo = getRepository();
  const existing = await repo.getRequest(id);

  if (!existing) {
    return c.json({ error: 'Request not found' }, 404);
  }

  // 申請者のみ取消し可能
  if (userId && existing.applicantId !== userId) {
    return c.json({ error: 'Only applicant can cancel' }, 403);
  }

  if (existing.status === 'approved' || existing.status === 'rejected') {
    return c.json({ error: 'Cannot cancel completed requests' }, 400);
  }

  const request = await repo.updateRequest(id, {
    status: 'cancelled',
    completedAt: new Date(),
  });

  return c.json({ success: true, request });
});

// 承認履歴取得（承認者名付き）
requestRoutes.get('/:id/history', async (c) => {
  const id = c.req.param('id');
  const repo = getRepository();
  const history = await repo.getApprovalHistory(id);

  // 承認者名を付与
  const historyWithApprover = await Promise.all(
    history.map(async (h) => {
      let approverName = null;
      if (h.approverId) {
        const approver = await repo.getUser(h.approverId);
        approverName = approver?.name ?? null;
      }
      return { ...h, approverName };
    })
  );

  return c.json({ history: historyWithApprover });
});
