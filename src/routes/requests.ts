import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { CreateRequestSchema, RequestStatus } from '../models/index.js';
import { getRepository } from '../repositories/lark-base.repository.js';
import { ApprovalService, type DataStore } from '../services/approval.service.js';
import { sendApprovalNotification, sendRequestStatusNotification } from '../lark/bot.js';
import { generateRequestPdf } from '../services/pdf.service.js';

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

// 申請詳細取得（承認ルート・履歴含む）
requestRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const repo = getRepository();

    // 並列でデータ取得
    const [request, historyRecords] = await Promise.all([
      repo.getRequest(id),
      repo.getApprovalHistory(id),
    ]);

    if (!request) {
      return c.json({ error: 'Request not found' }, 404);
    }

    // 並列で関連データ取得
    const [workflow, applicant, applicantOrg] = await Promise.all([
      repo.getWorkflowWithSteps(request.workflowId),
      repo.getUser(request.applicantId),
      repo.getOrganization(request.applicantOrganizationId),
    ]);

    if (!workflow || !applicant || !applicantOrg) {
      console.error('Related data not found:', {
        workflowId: request.workflowId,
        applicantId: request.applicantId,
        orgId: request.applicantOrganizationId,
        hasWorkflow: !!workflow,
        hasApplicant: !!applicant,
        hasOrg: !!applicantOrg
      });
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

    // 履歴に承認者名を追加
    const history = await Promise.all(
      historyRecords.map(async (h) => {
        const approver = h.approverId ? await repo.getUser(h.approverId) : null;
        return {
          ...h,
          approverName: approver?.name || '不明',
        };
      })
    );

    // Phase 1: ルート情報に拡張情報を付与
    const enrichedRoute = route.map((step) => {
      const stepDef = workflow.steps.find((s) => s.stepOrder === step.stepOrder);
      let deadlineDate: Date | null = null;
      let remainingDays: number | null = null;

      if (stepDef?.deadlineDays && request.submittedAt) {
        deadlineDate = new Date(request.submittedAt);
        deadlineDate.setDate(deadlineDate.getDate() + stepDef.deadlineDays);
        remainingDays = Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      }

      return {
        ...step,
        stepRoleType: stepDef?.stepRoleType ?? 'approver',
        multiApproverMode: stepDef?.multiApproverMode ?? 'single',
        deadlineDate,
        remainingDays,
        editableFields: stepDef?.editableFields ?? null,
      };
    });

    return c.json({
      request,
      workflow: {
        ...workflow,
        allowWithdrawal: workflow.allowWithdrawal,
        allowPullUp: workflow.allowPullUp,
        allowReuse: workflow.allowReuse,
        allowRouteChange: workflow.allowRouteChange,
        routeChangeRoles: workflow.routeChangeRoles,
        subjectAutoInputMode: workflow.subjectAutoInputMode,
        subjectTemplate: workflow.subjectTemplate,
      },
      applicant,
      route: enrichedRoute,
      history,
    });
  } catch (err) {
    console.error('Error fetching request detail:', err);
    return c.json({ error: 'サーバーエラーが発生しました' }, 500);
  }
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

// 差戻し（Phase 1: remandMode対応）
requestRoutes.post(
  '/:id/remand',
  zValidator(
    'json',
    z.object({
      comment: z.string().min(1, 'コメントは必須です').max(1000, 'コメントは1000文字以内で入力してください'),
      toStep: z.number().int().min(0).optional(),
      remandMode: z.string().optional(), // require_reapproval | choose_at_remand | no_reapproval
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
    const { comment, toStep, remandMode } = c.req.valid('json');
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

    // ワークフローのステップからremandModeを取得
    const workflow = await repo.getWorkflowWithSteps(existing.workflowId);
    const currentStepDef = workflow?.steps.find((s) => s.stepOrder === existing.currentStep);
    const effectiveRemandMode = remandMode || currentStepDef?.remandMode || 'require_reapproval';

    const dataStore = createDataStore();
    const approvalService = new ApprovalService(dataStore);
    const targetStep = toStep ?? approvalService.processRemandTarget(
      effectiveRemandMode,
      existing.currentStep,
      toStep
    );

    // 承認履歴を記録
    await repo.createApprovalHistory({
      requestId: id,
      stepOrder: existing.currentStep,
      approverId,
      action: 'remand',
      comment,
    });

    // ステータスと現在ステップを更新
    const newStatus = targetStep === 0 ? 'draft' : 'pending';
    const request = await repo.updateRequest(id, {
      status: newStatus,
      currentStep: targetStep,
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

    return c.json({ success: true, request, remandMode: effectiveRemandMode, targetStep });
  }
);

// 取り下げ（Phase 1: NI Collabo 360）
requestRoutes.post('/:id/withdraw', async (c) => {
  const id = c.req.param('id');
  const userId = c.req.header('X-User-Id');

  const repo = getRepository();
  const existing = await repo.getRequest(id);

  if (!existing) {
    return c.json({ error: 'Request not found' }, 404);
  }

  // 申請者のみ取り下げ可能
  if (userId && existing.applicantId !== userId) {
    return c.json({ error: 'Only applicant can withdraw' }, 403);
  }

  if (existing.status !== 'pending') {
    return c.json({ error: 'Can only withdraw pending requests' }, 400);
  }

  // ワークフローの取り下げ許可チェック
  const workflow = await repo.getWorkflowWithSteps(existing.workflowId);
  if (workflow && !workflow.allowWithdrawal) {
    return c.json({ error: 'Withdrawal is not allowed for this workflow' }, 400);
  }

  const request = await repo.updateRequest(id, {
    status: 'withdrawn',
    withdrawnAt: new Date(),
  });

  return c.json({ success: true, request });
});

// 引き上げ（Phase 1: NI Collabo 360）
requestRoutes.post('/:id/pull-up', async (c) => {
  const id = c.req.param('id');
  const userId = c.req.header('X-User-Id');

  if (!userId) {
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

  const workflow = await repo.getWorkflowWithSteps(existing.workflowId);
  const applicant = await repo.getUser(existing.applicantId);
  const applicantOrg = await repo.getOrganization(existing.applicantOrganizationId);

  if (!workflow || !applicant || !applicantOrg) {
    return c.json({ error: 'Related data not found' }, 500);
  }

  const dataStore = createDataStore();
  const approvalService = new ApprovalService(dataStore);

  const canPull = await approvalService.canPullUp(userId, {
    request: existing,
    applicant,
    applicantOrganization: applicantOrg,
    workflow,
    currentDate: new Date(),
  });

  if (!canPull) {
    return c.json({ error: 'You are not authorized to pull up this request' }, 403);
  }

  // 現在のステップから引き上げユーザーのステップまでを自動承認
  const route = await approvalService.resolveApprovalRoute({
    request: existing,
    applicant,
    applicantOrganization: applicantOrg,
    workflow,
    currentDate: new Date(),
  });

  let pullUpToStep = existing.currentStep;
  for (const step of route) {
    if (step.stepOrder >= existing.currentStep && step.approver?.id === userId) {
      pullUpToStep = step.stepOrder;
      break;
    }
  }

  // 中間ステップを引き上げ承認として記録
  for (let stepOrder = existing.currentStep; stepOrder <= pullUpToStep; stepOrder++) {
    await repo.createApprovalHistory({
      requestId: id,
      stepOrder,
      approverId: userId,
      action: stepOrder === pullUpToStep ? 'approve' : 'pull_up',
      comment: '引き上げ承認',
    });
  }

  // 次のステップに進む
  const nextStep = pullUpToStep + 1;
  const maxStep = workflow.steps.length;

  if (nextStep > maxStep) {
    const request = await repo.updateRequest(id, {
      status: 'approved',
      currentStep: nextStep,
      completedAt: new Date(),
    });
    return c.json({ success: true, request, completed: true });
  }

  const request = await repo.updateRequest(id, { currentStep: nextStep });
  return c.json({ success: true, request, completed: false });
});

// 再利用（Phase 1: NI Collabo 360）
requestRoutes.post('/:id/reuse', async (c) => {
  const id = c.req.param('id');
  const userId = c.req.header('X-User-Id');

  if (!userId) {
    return c.json({ error: 'X-User-Id header required' }, 400);
  }

  const repo = getRepository();
  const existing = await repo.getRequest(id);

  if (!existing) {
    return c.json({ error: 'Request not found' }, 404);
  }

  // 完了/却下/取り下げ済みのみ再利用可能
  if (!['approved', 'rejected', 'withdrawn'].includes(existing.status)) {
    return c.json({ error: 'Can only reuse completed/rejected/withdrawn requests' }, 400);
  }

  const workflow = await repo.getWorkflowWithSteps(existing.workflowId);
  if (workflow && !workflow.allowReuse) {
    return c.json({ error: 'Reuse is not allowed for this workflow' }, 400);
  }

  // 内容をコピーして新規draft作成
  const newRequest = await repo.createRequest({
    workflowId: existing.workflowId,
    applicantId: userId,
    applicantOrganizationId: existing.applicantOrganizationId,
    title: `[再利用] ${existing.title}`,
    content: existing.content,
  });

  return c.json({ success: true, request: newRequest }, 201);
});

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

// 条件付き承認（NI Collabo 19-11-7）
// 決裁者が通過済み経路メンバーにコメントを要求
requestRoutes.post(
  '/:id/conditional-approve',
  zValidator(
    'json',
    z.object({
      comment: z.string().max(1000).optional(),
      targetSteps: z.array(z.number().int().min(1)), // コメント要求先ステップ番号
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
    const { comment, targetSteps } = c.req.valid('json');
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

    // 現在のステップが決裁者であることを確認
    const workflow = await repo.getWorkflowWithSteps(existing.workflowId);
    const currentStepDef = workflow?.steps.find((s) => s.stepOrder === existing.currentStep);
    if (!currentStepDef || currentStepDef.stepRoleType !== 'final_approver') {
      return c.json({ error: '条件付き承認は決裁者のみ実行可能です' }, 403);
    }

    // 条件付き承認を履歴に記録
    await repo.createApprovalHistory({
      requestId: id,
      stepOrder: existing.currentStep,
      approverId,
      action: 'conditional_approve',
      comment: comment ?? undefined,
    });

    // ステータスを条件付き承認待ちに変更
    const request = await repo.updateRequest(id, {
      status: 'conditional_approve_wait',
    });

    return c.json({
      success: true,
      request,
      targetSteps,
      message: '条件付き承認を実行しました。指定されたステップの承認者にコメントを要求しています。',
    });
  }
);

// 条件付き承認コメント応答
requestRoutes.post(
  '/:id/conditional-approve-respond',
  zValidator(
    'json',
    z.object({
      comment: z.string().min(1, 'コメントは必須です').max(1000),
      stepOrder: z.number().int().min(1),
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
    const { comment, stepOrder } = c.req.valid('json');
    const userId = c.req.header('X-User-Id');

    if (!userId) {
      return c.json({ error: 'X-User-Id header required' }, 400);
    }

    const repo = getRepository();
    const existing = await repo.getRequest(id);

    if (!existing) {
      return c.json({ error: 'Request not found' }, 404);
    }

    if (existing.status !== 'conditional_approve_wait') {
      return c.json({ error: 'この申請は条件付き承認待ち状態ではありません' }, 400);
    }

    // コメントを履歴に記録
    await repo.createApprovalHistory({
      requestId: id,
      stepOrder,
      approverId: userId,
      action: 'approve',
      comment,
    });

    // すべてのコメントが揃ったか確認（簡易版: pendingに戻す）
    const request = await repo.updateRequest(id, {
      status: 'pending',
    });

    return c.json({ success: true, request });
  }
);

// 経路変更（NI Collabo 19-11: 承認者が承認経路を変更）
requestRoutes.post(
  '/:id/route-change',
  zValidator(
    'json',
    z.object({
      comment: z.string().max(1000).optional(),
      newSteps: z.array(z.object({
        stepOrder: z.number().int().min(1),
        stepType: z.enum(['position', 'role', 'specific_user']),
        specificUserId: z.string().optional(),
        label: z.string().optional(),
      })),
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
    const { comment, newSteps } = c.req.valid('json');
    const userId = c.req.header('X-User-Id');

    if (!userId) {
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

    // ワークフローの経路変更許可チェック
    const workflow = await repo.getWorkflowWithSteps(existing.workflowId);
    if (!workflow || !workflow.allowRouteChange) {
      return c.json({ error: 'この申請書では経路変更が許可されていません' }, 400);
    }

    // 現在のステップの承認者であるかチェック
    const dataStore = createDataStore();
    const approvalService = new ApprovalService(dataStore);
    const applicant = await repo.getUser(existing.applicantId);
    const applicantOrg = await repo.getOrganization(existing.applicantOrganizationId);

    if (!applicant || !applicantOrg) {
      return c.json({ error: 'Related data not found' }, 500);
    }

    const route = await approvalService.resolveApprovalRoute({
      request: existing,
      applicant,
      applicantOrganization: applicantOrg,
      workflow,
      currentDate: new Date(),
    });

    const currentStepInfo = route.find(
      (s) => s.stepOrder === existing.currentStep && s.status === 'pending'
    );

    if (currentStepInfo?.approver?.id !== userId) {
      return c.json({ error: '現在のステップの承認者のみ経路変更が可能です' }, 403);
    }

    // 新しいステップを追加（現在のステップ以降を差し替え）
    // 実際のLark Base実装では既存ステップの削除・追加が必要
    // ここでは履歴にのみ記録し、レスポンスで新しいステップ情報を返す
    await repo.createApprovalHistory({
      requestId: id,
      stepOrder: existing.currentStep,
      approverId: userId,
      action: 'approve',
      comment: comment ? `[経路変更] ${comment}` : '[経路変更]',
    });

    return c.json({
      success: true,
      message: '経路を変更しました',
      newSteps,
    });
  }
);

// PDF出力
requestRoutes.get('/:id/pdf', async (c) => {
  const id = c.req.param('id');
  const repo = getRepository();
  const request = await repo.getRequest(id);
  if (!request) return c.json({ error: '申請が見つかりません' }, 404);

  const workflow = await repo.getWorkflow(request.workflowId);
  if (!workflow) return c.json({ error: 'ワークフローが見つかりません' }, 404);

  // 経路解決
  const workflowWithSteps = await repo.getWorkflowWithSteps(request.workflowId);
  if (!workflowWithSteps) return c.json({ error: 'ワークフローが見つかりません' }, 404);

  const applicant = await repo.getUser(request.applicantId);
  const org = await repo.getOrganization(request.applicantOrganizationId);
  if (!applicant || !org) return c.json({ error: 'ユーザー情報が見つかりません' }, 404);

  const dataStore = createDataStore();
  const service = new ApprovalService(dataStore);
  const route = await service.resolveApprovalRoute({
    request,
    applicant,
    applicantOrganization: org,
    workflow: workflowWithSteps,
    currentDate: new Date(),
  });

  const history = await repo.getApprovalHistory(id);

  const pdfBytes = await generateRequestPdf(request, workflow, route, history);

  return new Response(pdfBytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="request-${request.docNumber || id}.pdf"`,
    },
  });
});
