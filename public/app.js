// State
let currentUser = null;
let users = [];
let workflows = [];
let larkUser = null;
let isLarkEnvironment = false;
let approvalRoles = [];
let isProcessing = false;

// API Base URL
const API_BASE = '/api';

// 権限チェック
function isAdmin() {
  return currentUser?.role === 'admin';
}
function isManager() {
  return currentUser?.role === 'admin' || currentUser?.role === 'manager';
}

// 認証付きAPIリクエスト
function apiHeaders(extraHeaders = {}) {
  return {
    'Content-Type': 'application/json',
    'X-User-Id': currentUser?.id || '',
    ...extraHeaders,
  };
}

// 管理系タブとボタンの表示制御
function applyPermissions() {
  // 管理者/マネージャー専用タブ
  const managerTabs = ['workflows', 'routeMasters', 'approvalRoles', 'importExport'];
  // 管理者/マネージャーが操作可能なボタン（セレクタ）
  const managerButtons = [
    '#createWorkflowBtn',
  ];

  managerTabs.forEach(tabId => {
    const tab = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (tab) tab.style.display = isManager() ? '' : 'none';
  });

  managerButtons.forEach(sel => {
    const btn = document.querySelector(sel);
    if (btn) btn.style.display = isManager() ? '' : 'none';
  });

  // ユーザーロール表示
  const roleDisplay = document.getElementById('userRole');
  if (roleDisplay && currentUser?.role) {
    const labels = { admin: '管理者', manager: 'マネージャー', user: '一般' };
    roleDisplay.textContent = labels[currentUser.role] || '一般';
    roleDisplay.className = `role-badge role-${currentUser.role}`;
  }
}

// ボタンのローディング状態を設定
function setButtonLoading(button, loading) {
  if (!button) return;
  if (loading) {
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.textContent = '処理中...';
    button.classList.add('loading');
  } else {
    button.disabled = false;
    button.textContent = button.dataset.originalText || button.textContent;
    button.classList.remove('loading');
  }
}

// 二重クリック防止ラッパー
async function preventDoubleClick(fn, button) {
  if (isProcessing) return;
  isProcessing = true;
  setButtonLoading(button, true);
  try {
    await fn();
  } finally {
    isProcessing = false;
    setButtonLoading(button, false);
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  initTabs();

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('logout') === '1') {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('larkUser');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  const inLark = window.h5sdk || window.tt || window.lark ||
                 navigator.userAgent.includes('Lark') ||
                 navigator.userAgent.includes('Feishu');

  if (inLark) {
    isLarkEnvironment = true;
    const userInfoDiv = document.getElementById('userInfo');
    userInfoDiv.innerHTML = '<span class="lark-user">認証中...</span>';

    const code = urlParams.get('code');
    if (code) {
      await handleOAuthCallback(code);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      const savedUser = localStorage.getItem('currentUser');
      if (savedUser) {
        try {
          currentUser = JSON.parse(savedUser);
          const larkUserData = localStorage.getItem('larkUser');
          if (larkUserData) larkUser = JSON.parse(larkUserData);
          showCurrentUser();
          Promise.all([loadRequests(), loadApprovals()]);
          // APIから最新のロール情報を取得して同期
          refreshCurrentUserRole();
        } catch (e) {
          console.error('Failed to parse saved user:', e);
          localStorage.removeItem('currentUser');
          localStorage.removeItem('larkUser');
          startOAuthFlow();
        }
      } else {
        startOAuthFlow();
      }
    }
  } else {
    loadUsers();
  }

  loadWorkflows();
  loadApprovalRoleData();
});

// OAuth
async function startOAuthFlow() {
  const userInfoDiv = document.getElementById('userInfo');
  userInfoDiv.innerHTML = '<span class="lark-user">OAuth認証開始中...</span>';
  try {
    const res = await fetch(`${API_BASE}/auth/login`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    if (data.authUrl) {
      window.location.href = data.authUrl;
    } else {
      userInfoDiv.innerHTML = '<span class="lark-user" style="color: var(--danger);">認証エラー</span>';
      showError('認証URLの取得に失敗しました');
    }
  } catch (err) {
    console.error('Failed to start OAuth flow:', err);
    userInfoDiv.innerHTML = '<span class="lark-user" style="color: var(--danger);">認証エラー</span>';
    showError('認証の開始に失敗しました: ' + getErrorMessage(err, '不明なエラー'));
  }
}

async function handleOAuthCallback(code) {
  try {
    const userInfoDiv = document.getElementById('userInfo');
    userInfoDiv.innerHTML = '<span class="lark-user">ログイン中...</span>';
    const res = await fetch(`${API_BASE}/auth/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      currentUser = data.user;
      larkUser = data.larkUser;
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      localStorage.setItem('larkUser', JSON.stringify(larkUser));
      showCurrentUser();
      loadRequests();
      loadApprovals();
    } else {
      let errorMsg = getErrorMessage(data, '認証に失敗しました');
      if (data.larkUser) errorMsg += `\n\nLarkユーザー: ${data.larkUser.name || data.larkUser.userId || '不明'}`;
      showError(errorMsg);
      userInfoDiv.innerHTML = '<span class="lark-user" style="color: var(--danger);">認証エラー</span>';
    }
  } catch (err) {
    console.error('OAuth callback error:', err);
    showError('認証処理中にエラーが発生しました: ' + getErrorMessage(err, '不明なエラー'));
  }
}

function showCurrentUser() {
  const userInfoDiv = document.getElementById('userInfo');
  const displayName = larkUser?.name || currentUser?.name || 'ユーザー';
  const roleLabels = { admin: '管理者', manager: 'マネージャー', user: '一般' };
  const role = currentUser?.role || 'user';
  const roleLabel = roleLabels[role] || '一般';
  userInfoDiv.innerHTML = `<span class="lark-user">${escapeHtml(displayName)}</span> <span id="userRole" class="role-badge role-${role}">${roleLabel}</span>`;
  applyPermissions();
}

// APIから最新のユーザー情報を取得してロールを同期
async function refreshCurrentUserRole() {
  if (!currentUser?.id) return;
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: apiHeaders() });
    if (res.ok) {
      const data = await res.json();
      if (data.user && data.user.role !== currentUser.role) {
        currentUser.role = data.user.role;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        showCurrentUser();
      }
    }
  } catch (e) {
    console.error('Failed to refresh user role:', e);
  }
}

function showError(message) {
  const main = document.querySelector('.main');
  const displayMessage = typeof message === 'string' ? message : getErrorMessage(message, 'エラーが発生しました');
  main.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#9888;</div><p>${escapeHtml(displayMessage)}</p></div>`;
}

// Tab switching
function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');

      const t = tab.dataset.tab;
      if (t === 'requests') loadRequests();
      if (t === 'approvals') loadApprovals();
      if (t === 'workflows') loadWorkflowsList();
      if (t === 'routeMasters') loadRouteMasters();
      if (t === 'approvalRoles') loadApprovalRoles();
    });
  });
}

// User management
async function loadUsers() {
  try {
    const res = await fetch(`${API_BASE}/users`);
    const data = await res.json();
    users = data.users || [];
    const select = document.getElementById('userSelect');
    select.innerHTML = '<option value="">ユーザーを選択...</option>';
    users.forEach(user => {
      const option = document.createElement('option');
      option.value = user.id;
      option.textContent = `${user.name} (${user.email})`;
      select.appendChild(option);
    });
    if (users.length > 0) {
      select.value = users[0].id;
      switchUser();
    }
  } catch (err) {
    console.error('Failed to load users:', err);
  }
}

function switchUser() {
  const select = document.getElementById('userSelect');
  currentUser = users.find(u => u.id === select.value) || null;
  if (currentUser) {
    applyPermissions();
    loadRequests();
    loadApprovals();
  }
}

// Workflows
async function loadWorkflows() {
  try {
    const res = await fetch(`${API_BASE}/workflows`);
    const data = await res.json();
    workflows = data.workflows || [];
    const select = document.getElementById('workflowSelect');
    select.innerHTML = '<option value="">選択してください</option>';
    workflows.filter(w => w.isActive).forEach(workflow => {
      const option = document.createElement('option');
      option.value = workflow.id;
      option.textContent = workflow.name;
      select.appendChild(option);
    });
  } catch (err) {
    console.error('Failed to load workflows:', err);
  }
}

async function loadWorkflowsList() {
  const container = document.getElementById('workflowsList');
  container.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    const res = await fetch(`${API_BASE}/workflows`);
    const data = await res.json();
    const wfs = data.workflows || [];
    if (wfs.length === 0) {
      container.innerHTML = '<div class="empty-state">ワークフローがありません</div>';
      return;
    }
    container.innerHTML = wfs.map(wf => `
      <div class="card workflow-card" style="cursor:pointer;" onclick="viewWorkflowDetail('${wf.id}')">
        <div class="workflow-info">
          <h3>${escapeHtml(wf.name)}</h3>
          <p>${escapeHtml(wf.description || '')}</p>
          <div class="workflow-steps">
            <span class="badge">${wf.category || '一般'}</span>
            <span class="badge ${wf.isActive ? 'badge-active' : 'badge-inactive'}">${wf.isActive ? '有効' : '無効'}</span>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="empty-state">読み込みに失敗しました</div>';
  }
}

// Requests
async function loadRequests() {
  if (!currentUser) return;
  const container = document.getElementById('requestsList');
  container.innerHTML = '<div class="loading">読み込み中...</div>';
  const status = document.getElementById('requestStatusFilter').value;
  try {
    let url = `${API_BASE}/requests?applicantId=${currentUser.id}`;
    if (status) url += `&status=${status}`;
    const res = await fetch(url);
    const data = await res.json();
    const requests = data.requests || [];
    if (requests.length === 0) {
      container.innerHTML = '<div class="empty-state">申請がありません</div>';
      return;
    }
    container.innerHTML = requests.map(request => `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">${escapeHtml(request.title)}</div>
            <div class="card-meta">作成日: ${formatDate(request.createdAt)}</div>
          </div>
          <span class="status status-${request.status}">${getStatusLabel(request.status)}</span>
        </div>
        <div class="card-footer">
          <span class="card-meta">ステップ ${request.currentStep}</span>
          <div class="card-actions">
            <button class="btn btn-sm" onclick="viewRequest('${request.id}', this)">詳細</button>
            ${request.status === 'draft' ? `<button class="btn btn-sm btn-primary" onclick="submitRequest('${request.id}', this)">提出</button>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="empty-state">読み込みに失敗しました</div>';
  }
}

async function loadApprovals() {
  if (!currentUser) return;
  const container = document.getElementById('approvalsList');
  container.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    const res = await fetch(`${API_BASE}/requests/pending?approverId=${currentUser.id}`);
    const data = await res.json();
    const requests = data.requests || [];
    if (requests.length === 0) {
      container.innerHTML = '<div class="empty-state">承認待ちの申請はありません</div>';
      return;
    }
    container.innerHTML = requests.map(request => `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">${escapeHtml(request.title)}</div>
            <div class="card-meta">申請者: ${escapeHtml(request.applicantName || '不明')} | 提出日: ${formatDate(request.submittedAt)}</div>
          </div>
          <span class="status status-pending">承認待ち</span>
        </div>
        <div class="card-footer">
          <span class="card-meta">ステップ ${request.currentStep}</span>
          <div class="card-actions">
            <button class="btn btn-sm" onclick="viewRequest('${request.id}', this)">詳細</button>
            <button class="btn btn-sm btn-success" onclick="showApprovalAction('${request.id}', 'approve')">承認</button>
            <button class="btn btn-sm btn-danger" onclick="showApprovalAction('${request.id}', 'reject')">却下</button>
            <button class="btn btn-sm btn-warning" onclick="showApprovalAction('${request.id}', 'remand')">差戻し</button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="empty-state">読み込みに失敗しました</div>';
  }
}

async function viewRequest(requestId, buttonElement) {
  if (buttonElement) setButtonLoading(buttonElement, true);
  try {
    const res = await fetch(`${API_BASE}/requests/${requestId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(getErrorMessage(data, '申請の取得に失敗しました'));
    const request = data.request;
    const route = data.route || [];
    const history = data.history || [];
    // ワークフロー情報を取得して権限チェックに使用
    const workflow = workflows.find(w => w.id === request.workflowId);
    request._workflow = workflow || {};
    document.getElementById('detailTitle').textContent = request.title;
    document.getElementById('requestDetail').innerHTML = `
      <div class="detail-section">
        <h4>基本情報</h4>
        ${request.docNumber ? `<div class="detail-row"><span class="detail-label">文書番号</span><span class="detail-value">${escapeHtml(request.docNumber)}</span></div>` : ''}
        <div class="detail-row"><span class="detail-label">ステータス</span><span class="detail-value"><span class="status status-${request.status}">${getStatusLabel(request.status)}</span></span></div>
        <div class="detail-row"><span class="detail-label">作成日</span><span class="detail-value">${formatDate(request.createdAt)}</span></div>
        <div class="detail-row"><span class="detail-label">提出日</span><span class="detail-value">${request.submittedAt ? formatDate(request.submittedAt) : '-'}</span></div>
        ${request.withdrawnAt ? `<div class="detail-row"><span class="detail-label">取下日</span><span class="detail-value">${formatDate(request.withdrawnAt)}</span></div>` : ''}
      </div>
      <div class="detail-section">
        <h4>承認ルート</h4>
        ${route.map((step, i) => {
          const roleLabel = step.stepRoleType ? getStepRoleLabel(step.stepRoleType) : '';
          const approverDisplay = step.approvers && step.approvers.length > 0
            ? step.approvers.map(a => `<span class="approver-chip ${a.status || ''}">${escapeHtml(a.name || a.userId)}${a.status === 'approved' ? ' ✓' : a.status === 'rejected' ? ' ✗' : ''}</span>`).join('')
            : (step.approver ? escapeHtml(step.approver.name) : (step.skipReason ? getSkipReasonLabel(step.skipReason) : '未割当'));
          const sealDisplay = step.status === 'approved' && step.approver
            ? (step.approver.sealImageUrl
              ? `<img class="seal-stamp" src="${escapeHtml(step.approver.sealImageUrl)}" alt="印">`
              : `<span class="seal-stamp-text">${escapeHtml((step.approver.name || '').substring(0, 1))}</span>`)
            : '';
          const deadlineInfo = step.deadlineDate ? `<div class="step-deadline ${step.remainingDays != null && step.remainingDays <= 1 ? 'urgent' : ''}">${step.remainingDays != null ? (step.remainingDays <= 0 ? '期限切れ' : '残り' + step.remainingDays + '日') : ''}</div>` : '';
          return `
          <div class="route-step">
            <div class="route-step-number ${step.status}">${i + 1}</div>
            <div class="route-step-info">
              <div class="route-step-label">${escapeHtml(step.label || 'ステップ ' + step.stepOrder)}${roleLabel ? ` <span class="step-role-badge">${roleLabel}</span>` : ''}</div>
              <div class="route-step-approver">${approverDisplay}</div>
              ${deadlineInfo}
            </div>
            ${sealDisplay}
            <span class="route-step-status status status-${step.status}">${getStepStatusLabel(step.status)}</span>
          </div>`;
        }).join('')}
      </div>
      ${history.length > 0 ? `
        <div class="detail-section">
          <h4>承認履歴</h4>
          <div class="timeline">
            ${history.map(h => `
              <div class="timeline-item">
                <div class="timeline-icon ${h.action}">${getActionIcon(h.action)}</div>
                <div class="timeline-content">
                  <div class="timeline-header">
                    <span class="timeline-action">${getActionLabel(h.action)}</span>
                    <span class="timeline-step">ステップ ${h.stepOrder}</span>
                  </div>
                  <div class="timeline-approver">${h.approverName ? escapeHtml(h.approverName) : (h.action === 'skip' ? 'システム' : '不明')}</div>
                  <div class="timeline-time">${formatDate(h.createdAt)}</div>
                  ${h.comment ? `<div class="timeline-comment">"${escapeHtml(h.comment)}"</div>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      ${(() => {
        const currentStep = route.find(s => s.stepOrder === request.currentStep && s.status === 'pending');
        const isApprover = currentStep?.approver?.id === currentUser?.id ||
          (currentStep?.approvers && currentStep.approvers.some(a => a.userId === currentUser?.id));
        const buttons = [];
        if (request.status === 'pending' && isApprover) {
          buttons.push(`<button class="btn btn-success" onclick="showApprovalAction('${request.id}', 'approve'); closeModal('requestDetailModal');">承認</button>`);
          buttons.push(`<button class="btn btn-danger" onclick="showApprovalAction('${request.id}', 'reject'); closeModal('requestDetailModal');">却下</button>`);
          buttons.push(`<button class="btn btn-warning" onclick="showRemandModeModal('${request.id}'); closeModal('requestDetailModal');">差戻し</button>`);
          // NI Collabo: 条件付き承認（決裁者のみ）
          if (currentStep?.stepRoleType === 'final_approver') {
            buttons.push(`<button class="btn btn-outline" onclick="showConditionalApproveModal('${request.id}', ${JSON.stringify(route.filter(s => s.status === 'approved').map(s => ({ stepOrder: s.stepOrder, label: s.label, approverName: s.approver?.name })))}); closeModal('requestDetailModal');">条件付承認</button>`);
          }
          // NI Collabo: 経路変更
          if (request._workflow?.allowRouteChange) {
            buttons.push(`<button class="btn btn-outline" onclick="showRouteChangeModal('${request.id}'); closeModal('requestDetailModal');">経路変更</button>`);
          }
        }
        // 引き上げ: 後続ステップの承認者がpending案件を引き上げ
        if (request.status === 'pending' && !isApprover && request._workflow?.allowPullUp) {
          const laterStep = route.find(s => s.stepOrder > request.currentStep &&
            (s.approver?.id === currentUser?.id || (s.approvers && s.approvers.some(a => a.userId === currentUser?.id))));
          if (laterStep) {
            buttons.push(`<button class="btn btn-info" onclick="showPullUpModal('${request.id}'); closeModal('requestDetailModal');">引き上げ</button>`);
          }
        }
        // 取り下げ: 申請者自身がpending案件を取り下げ
        if (request.status === 'pending' && request.applicantId === currentUser?.id && request._workflow?.allowWithdrawal) {
          buttons.push(`<button class="btn btn-secondary" onclick="showWithdrawModal('${request.id}'); closeModal('requestDetailModal');">取り下げ</button>`);
        }
        // 再利用: 完了/却下/取り下げ済み案件から新規作成
        if (['approved', 'rejected', 'withdrawn'].includes(request.status) && request._workflow?.allowReuse) {
          buttons.push(`<button class="btn btn-outline" onclick="executeReuse('${request.id}');">再利用</button>`);
        }
        // PDF出力
        if (request._workflow?.pdfSettings?.pdfEnabled || request.status !== 'draft') {
          buttons.push(`<button class="btn btn-outline" onclick="downloadRequestPdf('${request.id}');">PDF出力</button>`);
        }
        return buttons.length > 0 ? `<div class="form-actions">${buttons.join('')}</div>` : '';
      })()}
    `;
    showModal('requestDetailModal');
  } catch (err) {
    showAlert(getErrorMessage(err, '申請の取得に失敗しました'));
  } finally {
    if (buttonElement) setButtonLoading(buttonElement, false);
  }
}

// New request
function showNewRequestModal() {
  if (!currentUser) { showAlert('ユーザーを選択してください'); return; }
  document.getElementById('newRequestForm').reset();
  document.getElementById('approvalRoutePreview').style.display = 'none';
  showModal('newRequestModal');
}

let currentFormSchema = null;

async function onWorkflowSelect() {
  const workflowId = document.getElementById('workflowSelect').value;
  const preview = document.getElementById('approvalRoutePreview');
  const dynamicFields = document.getElementById('dynamicFormFields');
  if (!workflowId) { preview.style.display = 'none'; if (dynamicFields) dynamicFields.innerHTML = ''; currentFormSchema = null; currentSubjectAutoInputMode = 'none'; currentSubjectTemplate = null; return; }
  try {
    const res = await fetch(`${API_BASE}/workflows/${workflowId}`);
    const data = await res.json();
    const workflow = data.workflow;
    const steps = workflow.steps || [];
    currentFormSchema = workflow.formSchema;
    // NI Collabo: 件名自動入力設定
    currentSubjectAutoInputMode = workflow.subjectAutoInputMode || 'none';
    currentSubjectTemplate = workflow.subjectTemplate || null;
    const titleInput = document.getElementById('requestTitle');
    if (titleInput && currentSubjectAutoInputMode !== 'none') {
      titleInput.readOnly = true;
      titleInput.style.background = 'var(--gray-100)';
      autoGenerateSubject();
    } else if (titleInput) {
      titleInput.readOnly = false;
      titleInput.style.background = '';
    }
    if (dynamicFields) dynamicFields.innerHTML = renderFormFields(workflow.formSchema);
    if (steps.length > 0) {
      document.getElementById('routeSteps').innerHTML = steps.map((step, i) => `
        <div class="route-step">
          <div class="route-step-number">${i + 1}</div>
          <div class="route-step-info">
            <div class="route-step-label">${escapeHtml(step.label || 'ステップ ' + step.stepOrder)}</div>
            <div class="route-step-approver">${getStepTypeLabel(step.stepType)}</div>
          </div>
        </div>
      `).join('');
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
    }
  } catch (err) {
    preview.style.display = 'none';
    currentFormSchema = null;
  }
}

function renderFormFields(formSchema, options = {}) {
  if (!formSchema || !formSchema.fields || formSchema.fields.length === 0) return '';
  const { userRoleType } = options; // 現在のユーザーの役割タイプ（承認画面用）
  return formSchema.fields.map(field => {
    const required = field.required ? 'required' : '';
    const requiredMark = field.required ? '<span style="color: var(--danger);">*</span>' : '';
    const condAttr = field.displayCondition ? `data-display-condition='${JSON.stringify(field.displayCondition)}'` : '';

    // NI Collabo: 吹き出し（ツールチップ）
    const tooltipHtml = field.tooltip ? `<span class="field-tooltip-wrap"><span class="field-tooltip-icon">?</span><span class="field-tooltip-content">${escapeHtml(field.tooltip)}</span></span>` : '';

    // NI Collabo: 役割別編集可否
    let isFieldDisabled = field.editDisabled === true;
    if (!isFieldDisabled && userRoleType && field.editableByRoles && field.editableByRoles.length > 0) {
      isFieldDisabled = !field.editableByRoles.includes(userRoleType);
    }
    const disabledClass = isFieldDisabled ? ' field-disabled' : '';
    const disabledAttr = isFieldDisabled ? 'disabled' : '';

    const wrapper = (html) => `<div class="form-group${disabledClass}" id="group_${field.name}" ${condAttr}>${html}</div>`;
    const onChangeAttr = `onchange="onFormFieldChange('${field.name}')" oninput="onFormFieldChange('${field.name}')"`;
    switch (field.type) {
      case 'text': return wrapper(`<label for="field_${field.name}">${escapeHtml(field.label)} ${requiredMark}${tooltipHtml}</label><input type="text" id="field_${field.name}" name="${field.name}" placeholder="${escapeHtml(field.placeholder || '')}" ${required} ${disabledAttr} ${onChangeAttr}>`);
      case 'number': return wrapper(`<label for="field_${field.name}">${escapeHtml(field.label)} ${requiredMark}${tooltipHtml}</label><input type="number" id="field_${field.name}" name="${field.name}" placeholder="${escapeHtml(field.placeholder || '')}" ${required} ${disabledAttr} ${onChangeAttr}>`);
      case 'date': return wrapper(`<label for="field_${field.name}">${escapeHtml(field.label)} ${requiredMark}${tooltipHtml}</label><input type="date" id="field_${field.name}" name="${field.name}" ${required} ${disabledAttr} ${onChangeAttr}>`);
      case 'select': return wrapper(`<label for="field_${field.name}">${escapeHtml(field.label)} ${requiredMark}${tooltipHtml}</label><select id="field_${field.name}" name="${field.name}" ${required} ${disabledAttr} ${onChangeAttr}><option value="">選択してください</option>${(field.options || []).map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('')}</select>`);
      case 'textarea': return wrapper(`<label for="field_${field.name}">${escapeHtml(field.label)} ${requiredMark}${tooltipHtml}</label><textarea id="field_${field.name}" name="${field.name}" rows="3" placeholder="${escapeHtml(field.placeholder || '')}" ${required} ${disabledAttr} ${onChangeAttr}></textarea>`);
      case 'checkbox': return wrapper(`<label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="field_${field.name}" name="${field.name}" ${disabledAttr} ${onChangeAttr}>${escapeHtml(field.label)}${tooltipHtml}</label>`);
      case 'time': return wrapper(`<label for="field_${field.name}">${escapeHtml(field.label)} ${requiredMark}${tooltipHtml}</label><input type="time" id="field_${field.name}" name="${field.name}" step="${(field.timeInterval || 30) * 60}" ${required} ${disabledAttr} ${onChangeAttr}>`);
      case 'radio': return wrapper(`<label>${escapeHtml(field.label)} ${requiredMark}${tooltipHtml}</label><div class="radio-group ${field.radioLayout || 'vertical'}">${(field.options || []).map((o, i) => `<label class="radio-label"><input type="radio" name="${field.name}" id="field_${field.name}_${i}" value="${escapeHtml(o.value)}" ${i === 0 && field.required ? 'required' : ''} ${disabledAttr} ${onChangeAttr}> ${escapeHtml(o.label)}</label>`).join('')}</div>`);
      case 'employee_select': return wrapper(`<label for="field_${field.name}">${escapeHtml(field.label)} ${requiredMark}${tooltipHtml}</label><select id="field_${field.name}" name="${field.name}" ${required} ${disabledAttr} ${onChangeAttr}><option value="">社員を選択...</option>${users.map(u => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('')}</select>`);
      case 'department_select': return wrapper(`<label for="field_${field.name}">${escapeHtml(field.label)} ${requiredMark}${tooltipHtml}</label><select id="field_${field.name}" name="${field.name}" ${required} ${disabledAttr} ${onChangeAttr}><option value="">部署を選択...</option></select>`);
      case 'auto_calc': return wrapper(`<label for="field_${field.name}">${escapeHtml(field.label)}${tooltipHtml}</label><input type="text" id="field_${field.name}" name="${field.name}" readonly class="auto-calc-field" data-formula="${escapeHtml(field.calcFormula || '')}" data-decimals="${field.calcDecimalPlaces || 0}" data-rounding="${field.calcRounding || 'round'}" tabindex="-1">`);
      case 'detail_table': return wrapper(`<label>${escapeHtml(field.label)} ${requiredMark}${tooltipHtml}</label>${renderDetailTable(field)}`);
      default: return '';
    }
  }).join('');
}

function renderDetailTable(field) {
  const columns = field.detailColumns || [];
  if (columns.length === 0) return '<p>明細列が未定義です</p>';
  return `
    <table class="detail-table" id="detail_${field.name}">
      <thead><tr>${columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}<th style="width:40px;"></th></tr></thead>
      <tbody></tbody>
      ${columns.some(c => c.enableTotal) ? `<tfoot><tr>${columns.map(c => `<td class="detail-total" id="total_${field.name}_${c.name}">${c.enableTotal ? '0' : ''}</td>`).join('')}<td></td></tr></tfoot>` : ''}
    </table>
    <button type="button" class="btn btn-sm" onclick="addDetailRow('${field.name}')">+ 行追加</button>
  `;
}

function addDetailRow(fieldName) {
  const field = currentFormSchema?.fields?.find(f => f.name === fieldName);
  if (!field || !field.detailColumns) return;
  const tbody = document.querySelector(`#detail_${fieldName} tbody`);
  const rowIndex = tbody.children.length;
  const tr = document.createElement('tr');
  tr.innerHTML = field.detailColumns.map(c => {
    const inputId = `detail_${fieldName}_${rowIndex}_${c.name}`;
    const onChange = `onchange="updateDetailTotals('${fieldName}')" oninput="updateDetailTotals('${fieldName}')"`;
    switch (c.type || 'text') {
      case 'number': return `<td><input type="number" id="${inputId}" class="detail-input" ${onChange}></td>`;
      case 'select': return `<td><select id="${inputId}" class="detail-input" ${onChange}><option value="">-</option>${(c.options || []).map(o => `<option value="${escapeHtml(o.value || o)}">${escapeHtml(o.label || o)}</option>`).join('')}</select></td>`;
      default: return `<td><input type="text" id="${inputId}" class="detail-input" ${onChange}></td>`;
    }
  }).join('') + `<td><button type="button" class="btn btn-sm btn-danger" onclick="this.closest('tr').remove(); updateDetailTotals('${fieldName}')">x</button></td>`;
  tbody.appendChild(tr);
}

function updateDetailTotals(fieldName) {
  const field = currentFormSchema?.fields?.find(f => f.name === fieldName);
  if (!field || !field.detailColumns) return;
  const tbody = document.querySelector(`#detail_${fieldName} tbody`);
  if (!tbody) return;
  field.detailColumns.forEach(c => {
    if (!c.enableTotal) return;
    let total = 0;
    for (let i = 0; i < tbody.children.length; i++) {
      const input = document.getElementById(`detail_${fieldName}_${i}_${c.name}`);
      if (input) total += parseFloat(input.value) || 0;
    }
    const totalEl = document.getElementById(`total_${fieldName}_${c.name}`);
    if (totalEl) totalEl.textContent = total.toLocaleString();
  });
  // 自動計算フィールド更新
  recalcAutoFields();
}

function onFormFieldChange(changedField) {
  evaluateDisplayConditions();
  recalcAutoFields();
  validateSizeComparisons();
  autoGenerateSubject();
}

function evaluateDisplayConditions() {
  if (!currentFormSchema || !currentFormSchema.fields) return;
  currentFormSchema.fields.forEach(field => {
    if (!field.displayCondition) return;
    const group = document.getElementById(`group_${field.name}`);
    if (!group) return;
    const cond = field.displayCondition;
    const sourceEl = document.getElementById(`field_${cond.field}`);
    if (!sourceEl) return;
    const val = sourceEl.type === 'checkbox' ? sourceEl.checked : sourceEl.value;
    const visible = evaluateCondition(val, cond.operator, cond.value);
    group.style.display = visible ? '' : 'none';
    // 非表示時にrequiredを外す
    const inputs = group.querySelectorAll('input, select, textarea');
    inputs.forEach(inp => {
      if (!visible) { inp.removeAttribute('required'); }
      else if (field.required) { inp.setAttribute('required', ''); }
    });
  });
}

function evaluateCondition(actual, operator, expected) {
  switch (operator) {
    case 'eq': return String(actual) === String(expected);
    case 'neq': return String(actual) !== String(expected);
    case 'gt': return Number(actual) > Number(expected);
    case 'gte': return Number(actual) >= Number(expected);
    case 'lt': return Number(actual) < Number(expected);
    case 'lte': return Number(actual) <= Number(expected);
    case 'contains': return String(actual).includes(String(expected));
    default: return true;
  }
}

function recalcAutoFields() {
  if (!currentFormSchema || !currentFormSchema.fields) return;
  currentFormSchema.fields.filter(f => f.type === 'auto_calc').forEach(field => {
    const el = document.getElementById(`field_${field.name}`);
    if (!el || !field.calcFormula) return;
    try {
      // 数式の変数を値で置換: "{quantity} * {price}" → "10 * 500"
      let expr = field.calcFormula.replace(/\{(\w+)\}/g, (_, name) => {
        const input = document.getElementById(`field_${name}`);
        return input ? (parseFloat(input.value) || 0) : 0;
      });
      const result = Function('"use strict"; return (' + expr + ')')();
      const decimals = field.calcDecimalPlaces || 0;
      const rounding = field.calcRounding || 'round';
      const factor = Math.pow(10, decimals);
      let rounded;
      switch (rounding) {
        case 'floor': rounded = Math.floor(result * factor) / factor; break;
        case 'ceil': rounded = Math.ceil(result * factor) / factor; break;
        default: rounded = Math.round(result * factor) / factor; break;
      }
      el.value = isNaN(rounded) ? '' : rounded;
    } catch { el.value = ''; }
  });
}

// NI Collabo: 大小比較バリデーション（19-6）
function validateSizeComparisons() {
  if (!currentFormSchema || !currentFormSchema.sizeComparisons) return true;
  let allValid = true;
  // 既存エラー表示をクリア
  document.querySelectorAll('.size-comparison-error').forEach(el => el.remove());

  for (const comp of currentFormSchema.sizeComparisons) {
    const elA = document.getElementById(`field_${comp.fieldA}`);
    const elB = document.getElementById(`field_${comp.fieldB}`);
    if (!elA || !elB) continue;

    const valA = elA.type === 'date' ? elA.value : parseFloat(elA.value);
    const valB = elB.type === 'date' ? elB.value : parseFloat(elB.value);

    if (valA === '' || valA === null || isNaN(valA) || valB === '' || valB === null || isNaN(valB)) continue;

    let valid = true;
    if (comp.operator === 'lt') valid = valA < valB;
    else if (comp.operator === 'lte') valid = valA <= valB;

    if (!valid) {
      allValid = false;
      const fieldDef = currentFormSchema.fields.find(f => f.name === comp.fieldB);
      const errorMsg = comp.errorMessage || `${getFieldLabel(comp.fieldA)} は ${getFieldLabel(comp.fieldB)} より小さい値にしてください`;
      const errorEl = document.createElement('div');
      errorEl.className = 'size-comparison-error';
      errorEl.textContent = errorMsg;
      const group = document.getElementById(`group_${comp.fieldB}`);
      if (group) group.appendChild(errorEl);
    }
  }
  return allValid;
}

function getFieldLabel(fieldName) {
  if (!currentFormSchema || !currentFormSchema.fields) return fieldName;
  const field = currentFormSchema.fields.find(f => f.name === fieldName);
  return field ? field.label : fieldName;
}

// NI Collabo: 件名の自動入力（19-6）
let currentSubjectAutoInputMode = 'none';
let currentSubjectTemplate = null;

function autoGenerateSubject() {
  if (currentSubjectAutoInputMode === 'none') return;
  const titleInput = document.getElementById('requestTitle');
  if (!titleInput) return;

  switch (currentSubjectAutoInputMode) {
    case 'from_basic': {
      // ワークフロー名 + 日付
      const wfSelect = document.getElementById('workflowSelect');
      const wfName = wfSelect?.selectedOptions?.[0]?.textContent || '';
      const today = new Date().toLocaleDateString('ja-JP');
      titleInput.value = `${wfName} ${today}`;
      break;
    }
    case 'from_fields': {
      // 全フィールドの値を連結
      if (!currentFormSchema || !currentFormSchema.fields) return;
      const parts = [];
      const wfSelect = document.getElementById('workflowSelect');
      const wfName = wfSelect?.selectedOptions?.[0]?.textContent || '';
      if (wfName) parts.push(wfName);
      currentFormSchema.fields.forEach(field => {
        if (field.type === 'detail_table' || field.type === 'auto_calc') return;
        const el = document.getElementById(`field_${field.name}`);
        if (!el || !el.value) return;
        if (field.type === 'select' && el.selectedOptions?.[0]) {
          parts.push(el.selectedOptions[0].textContent);
        } else if (field.type !== 'checkbox') {
          parts.push(el.value);
        }
      });
      titleInput.value = parts.join(' / ').substring(0, 200);
      break;
    }
    case 'template': {
      // テンプレートベース "{category} - {amount}円"
      if (!currentSubjectTemplate) return;
      let result = currentSubjectTemplate;
      result = result.replace(/\{(\w+)\}/g, (_, name) => {
        const el = document.getElementById(`field_${name}`);
        if (!el) return '';
        if (el.tagName === 'SELECT' && el.selectedOptions?.[0]) {
          return el.selectedOptions[0].textContent;
        }
        return el.value || '';
      });
      titleInput.value = result.substring(0, 200);
      break;
    }
  }
}

function collectFormData() {
  if (!currentFormSchema || !currentFormSchema.fields) return {};
  const data = {};
  currentFormSchema.fields.forEach(field => {
    // 非表示フィールドはスキップ
    const group = document.getElementById(`group_${field.name}`);
    if (group && group.style.display === 'none') return;

    if (field.type === 'radio') {
      const checked = document.querySelector(`input[name="${field.name}"]:checked`);
      data[field.name] = checked ? checked.value : null;
      return;
    }
    if (field.type === 'detail_table') {
      const rows = [];
      const tbody = document.querySelector(`#detail_${field.name} tbody`);
      if (tbody) {
        for (let i = 0; i < tbody.children.length; i++) {
          const row = {};
          (field.detailColumns || []).forEach(c => {
            const input = document.getElementById(`detail_${field.name}_${i}_${c.name}`);
            if (input) row[c.name] = (c.type === 'number') ? (parseFloat(input.value) || 0) : (input.value || '');
          });
          rows.push(row);
        }
      }
      data[field.name] = rows;
      return;
    }
    const el = document.getElementById(`field_${field.name}`);
    if (!el) return;
    if (field.type === 'checkbox') data[field.name] = el.checked;
    else if (field.type === 'number' || field.type === 'auto_calc') data[field.name] = el.value ? Number(el.value) : null;
    else data[field.name] = el.value || null;
  });
  return data;
}

async function createRequest(event) {
  event.preventDefault();
  if (isProcessing) return;
  const form = event.target;
  const submitButton = event.submitter;
  const action = submitButton.value;
  const workflowId = document.getElementById('workflowSelect').value;
  const title = document.getElementById('requestTitle').value;
  if (!workflowId || !title) { showAlert('ワークフローと件名は必須です'); return; }
  // NI Collabo: 大小比較バリデーション
  if (!validateSizeComparisons()) { showAlert('入力値の大小関係に問題があります。エラー表示を確認してください。'); return; }
  isProcessing = true;
  const allButtons = form.querySelectorAll('button[type="submit"]');
  allButtons.forEach(btn => setButtonLoading(btn, true));
  const formData = collectFormData();
  try {
    const createRes = await fetch(`${API_BASE}/requests`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflowId, applicantId: currentUser.id, applicantOrganizationId: currentUser.organizationId || 'SALES1-1', title, content: formData })
    });
    if (!createRes.ok) throw new Error(getErrorMessage(await createRes.json().catch(() => ({})), '申請の作成に失敗しました'));
    const createData = await createRes.json();
    if (action === 'submit') {
      const submitRes = await fetch(`${API_BASE}/requests/${createData.request.id}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if (!submitRes.ok) throw new Error(getErrorMessage(await submitRes.json().catch(() => ({})), '申請の提出に失敗しました'));
      showAlert('申請を提出しました');
    } else {
      showAlert('下書きを保存しました');
    }
    closeModal('newRequestModal');
    loadRequests();
  } catch (err) {
    showAlert(getErrorMessage(err, '申請処理中にエラーが発生しました'));
  } finally {
    isProcessing = false;
    allButtons.forEach(btn => setButtonLoading(btn, false));
  }
}

async function submitRequest(requestId, buttonElement) {
  if (isProcessing || !currentUser) return;
  isProcessing = true;
  if (buttonElement) setButtonLoading(buttonElement, true);
  try {
    const res = await fetch(`${API_BASE}/requests/${requestId}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    if (!res.ok) throw new Error(getErrorMessage(await res.json().catch(() => ({})), '提出に失敗しました'));
    showAlert('申請を提出しました');
    loadRequests();
  } catch (err) {
    showAlert(getErrorMessage(err, '提出に失敗しました'));
  } finally {
    isProcessing = false;
    if (buttonElement) setButtonLoading(buttonElement, false);
  }
}

// Approval actions
function showApprovalAction(requestId, action) {
  document.getElementById('actionRequestId').value = requestId;
  document.getElementById('actionType').value = action;
  document.getElementById('actionComment').value = '';
  const titles = { approve: '承認', reject: '却下', remand: '差戻し' };
  const commentTextarea = document.getElementById('actionComment');
  const isRequired = action === 'reject' || action === 'remand';
  commentTextarea.required = isRequired;
  commentTextarea.placeholder = isRequired ? 'コメントを入力してください（必須）' : 'コメントを入力（任意）';
  document.getElementById('approvalActionTitle').textContent = titles[action];
  document.getElementById('actionSubmitBtn').textContent = titles[action];
  document.getElementById('actionSubmitBtn').className = `btn btn-${action === 'approve' ? 'success' : action === 'reject' ? 'danger' : 'warning'}`;
  showModal('approvalActionModal');
}

async function submitApprovalAction(event) {
  event.preventDefault();
  if (isProcessing || !currentUser) return;
  const requestId = document.getElementById('actionRequestId').value;
  const action = document.getElementById('actionType').value;
  const comment = document.getElementById('actionComment').value.trim();
  if ((action === 'reject' || action === 'remand') && !comment) { showAlert('却下・差戻しの場合はコメントが必須です'); return; }
  const submitBtn = document.getElementById('actionSubmitBtn');
  isProcessing = true;
  setButtonLoading(submitBtn, true);
  try {
    const res = await fetch(`${API_BASE}/requests/${requestId}/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUser.id },
      body: JSON.stringify({ comment: comment || undefined })
    });
    if (!res.ok) throw new Error(getErrorMessage(await res.json().catch(() => ({})), `${action}に失敗しました`));
    showAlert({ approve: '承認しました', reject: '却下しました', remand: '差し戻しました' }[action]);
    closeModal('approvalActionModal');
    loadRequests();
    loadApprovals();
  } catch (err) {
    showAlert(getErrorMessage(err, '処理中にエラーが発生しました'));
  } finally {
    isProcessing = false;
    setButtonLoading(submitBtn, false);
  }
}

// ==================== 差戻しモード・引き上げ・取り下げ・再利用 ====================

function showRemandModeModal(requestId) {
  document.getElementById('remandRequestId').value = requestId;
  document.getElementById('remandModeSelect').value = 'require_reapproval';
  document.getElementById('remandTargetStep').value = '';
  document.getElementById('remandComment').value = '';
  const targetStepGroup = document.getElementById('remandTargetStepGroup');
  if (targetStepGroup) targetStepGroup.style.display = 'none';
  showModal('remandModeModal');
}

function onRemandModeChange() {
  const mode = document.getElementById('remandModeSelect').value;
  const targetStepGroup = document.getElementById('remandTargetStepGroup');
  if (targetStepGroup) {
    targetStepGroup.style.display = mode === 'choose_at_remand' ? 'block' : 'none';
  }
}

async function submitRemandWithMode(event) {
  event.preventDefault();
  if (isProcessing || !currentUser) return;
  const requestId = document.getElementById('remandRequestId').value;
  const remandMode = document.getElementById('remandModeSelect').value;
  const comment = document.getElementById('remandComment').value.trim();
  const targetStep = document.getElementById('remandTargetStep').value;
  if (!comment) { showAlert('差戻しコメントは必須です'); return; }
  const submitBtn = event.target.querySelector('button[type="submit"]');
  isProcessing = true;
  if (submitBtn) setButtonLoading(submitBtn, true);
  try {
    const body = { comment, remandMode };
    if (remandMode === 'choose_at_remand' && targetStep) {
      body.targetStep = parseInt(targetStep, 10);
    }
    const res = await fetch(`${API_BASE}/requests/${requestId}/remand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUser.id },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(getErrorMessage(await res.json().catch(() => ({})), '差戻しに失敗しました'));
    showAlert('差し戻しました');
    closeModal('remandModeModal');
    loadRequests();
    loadApprovals();
  } catch (err) {
    showAlert(getErrorMessage(err, '差戻し処理中にエラーが発生しました'));
  } finally {
    isProcessing = false;
    if (submitBtn) setButtonLoading(submitBtn, false);
  }
}

function showPullUpModal(requestId) {
  document.getElementById('pullUpRequestId').value = requestId;
  showModal('pullUpModal');
}

async function executePullUp() {
  if (isProcessing || !currentUser) return;
  const requestId = document.getElementById('pullUpRequestId').value;
  isProcessing = true;
  try {
    const res = await fetch(`${API_BASE}/requests/${requestId}/pull-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUser.id },
      body: JSON.stringify({})
    });
    if (!res.ok) throw new Error(getErrorMessage(await res.json().catch(() => ({})), '引き上げに失敗しました'));
    showAlert('引き上げが完了しました');
    closeModal('pullUpModal');
    loadRequests();
    loadApprovals();
  } catch (err) {
    showAlert(getErrorMessage(err, '引き上げ処理中にエラーが発生しました'));
  } finally {
    isProcessing = false;
  }
}

function showWithdrawModal(requestId) {
  document.getElementById('withdrawRequestId').value = requestId;
  showModal('withdrawModal');
}

async function executeWithdraw() {
  if (isProcessing || !currentUser) return;
  const requestId = document.getElementById('withdrawRequestId').value;
  isProcessing = true;
  try {
    const res = await fetch(`${API_BASE}/requests/${requestId}/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUser.id },
      body: JSON.stringify({})
    });
    if (!res.ok) throw new Error(getErrorMessage(await res.json().catch(() => ({})), '取り下げに失敗しました'));
    showAlert('取り下げました');
    closeModal('withdrawModal');
    loadRequests();
    loadApprovals();
  } catch (err) {
    showAlert(getErrorMessage(err, '取り下げ処理中にエラーが発生しました'));
  } finally {
    isProcessing = false;
  }
}

async function executeReuse(requestId) {
  if (isProcessing || !currentUser) return;
  isProcessing = true;
  try {
    const res = await fetch(`${API_BASE}/requests/${requestId}/reuse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUser.id },
      body: JSON.stringify({})
    });
    if (!res.ok) throw new Error(getErrorMessage(await res.json().catch(() => ({})), '再利用に失敗しました'));
    const data = await res.json();
    showAlert('再利用申請を作成しました（下書き）');
    closeModal('requestDetailModal');
    loadRequests();
    if (data.request?.id) {
      setTimeout(() => viewRequest(data.request.id), 500);
    }
  } catch (err) {
    showAlert(getErrorMessage(err, '再利用処理中にエラーが発生しました'));
  } finally {
    isProcessing = false;
  }
}

// ==================== 条件付き承認（NI Collabo 19-11-7） ====================

function showConditionalApproveModal(requestId, approvedSteps) {
  document.getElementById('conditionalApproveRequestId').value = requestId;
  document.getElementById('conditionalApproveComment').value = '';
  const container = document.getElementById('conditionalApproveTargetSteps');
  container.innerHTML = approvedSteps.map(s => `
    <label style="display:flex;align-items:center;gap:8px;margin:4px 0;">
      <input type="checkbox" name="conditionalTarget" value="${s.stepOrder}">
      ステップ${s.stepOrder}: ${escapeHtml(s.label || '')} (${escapeHtml(s.approverName || '不明')})
    </label>
  `).join('');
  showModal('conditionalApproveModal');
}

async function submitConditionalApprove(event) {
  event.preventDefault();
  if (isProcessing || !currentUser) return;
  const requestId = document.getElementById('conditionalApproveRequestId').value;
  const comment = document.getElementById('conditionalApproveComment').value.trim();
  const checkboxes = document.querySelectorAll('input[name="conditionalTarget"]:checked');
  const targetSteps = Array.from(checkboxes).map(cb => parseInt(cb.value, 10));

  if (targetSteps.length === 0) { showAlert('コメントを要求するステップを選択してください'); return; }

  isProcessing = true;
  try {
    const res = await fetch(`${API_BASE}/requests/${requestId}/conditional-approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUser.id },
      body: JSON.stringify({ comment: comment || undefined, targetSteps })
    });
    if (!res.ok) throw new Error(getErrorMessage(await res.json().catch(() => ({})), '条件付き承認に失敗しました'));
    showAlert('条件付き承認を実行しました。指定されたステップの承認者にコメントを要求しています。');
    closeModal('conditionalApproveModal');
    loadRequests();
    loadApprovals();
  } catch (err) {
    showAlert(getErrorMessage(err, '条件付き承認に失敗しました'));
  } finally {
    isProcessing = false;
  }
}

// ==================== 経路変更（NI Collabo 19-11） ====================

function showRouteChangeModal(requestId) {
  document.getElementById('routeChangeRequestId').value = requestId;
  document.getElementById('routeChangeComment').value = '';
  document.getElementById('routeChangeLabel').value = '';
  // ユーザー選択肢を設定
  const select = document.getElementById('routeChangeUser');
  select.innerHTML = '<option value="">ユーザーを選択...</option>';
  users.forEach(u => {
    select.innerHTML += `<option value="${u.id}">${escapeHtml(u.name)}</option>`;
  });
  showModal('routeChangeModal');
}

async function submitRouteChange(event) {
  event.preventDefault();
  if (isProcessing || !currentUser) return;
  const requestId = document.getElementById('routeChangeRequestId').value;
  const userId = document.getElementById('routeChangeUser').value;
  const label = document.getElementById('routeChangeLabel').value.trim();
  const comment = document.getElementById('routeChangeComment').value.trim();

  if (!userId) { showAlert('追加する承認者を選択してください'); return; }

  isProcessing = true;
  try {
    const res = await fetch(`${API_BASE}/requests/${requestId}/route-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUser.id },
      body: JSON.stringify({
        comment: comment || undefined,
        newSteps: [{ stepOrder: 99, stepType: 'specific_user', specificUserId: userId, label: label || '追加承認' }]
      })
    });
    if (!res.ok) throw new Error(getErrorMessage(await res.json().catch(() => ({})), '経路変更に失敗しました'));
    showAlert('経路を変更しました');
    closeModal('routeChangeModal');
    loadRequests();
    loadApprovals();
  } catch (err) {
    showAlert(getErrorMessage(err, '経路変更に失敗しました'));
  } finally {
    isProcessing = false;
  }
}

// ==================== 経路マスタ ====================

async function loadRouteMasters() {
  const container = document.getElementById('routeMastersList');
  if (!container) return;
  container.innerHTML = '<div class="loading">読み込み中...</div>';

  // ワークフロー選択肢を設定
  const filterSelect = document.getElementById('routeMasterWorkflowFilter');
  if (filterSelect && filterSelect.options.length <= 1) {
    workflows.forEach(wf => {
      const opt = document.createElement('option');
      opt.value = wf.id;
      opt.textContent = wf.name;
      filterSelect.appendChild(opt);
    });
  }

  const workflowId = document.getElementById('routeMasterWorkflowFilter')?.value || '';
  try {
    let url = `${API_BASE}/route-masters`;
    if (workflowId) url += `?workflowId=${workflowId}`;
    const res = await fetch(url);
    const data = await res.json();
    const masters = data.routeMasters || [];
    if (masters.length === 0) {
      container.innerHTML = '<div class="empty-state">経路マスタがありません</div>';
      return;
    }
    const routeTypeLabels = { basic: '基本', by_position: '役職別', by_department: '部署別', by_individual: '個人別' };
    container.innerHTML = masters.map(m => `
      <div class="card" style="cursor:pointer;" onclick="viewRouteMasterDetail('${m.id}')">
        <div class="card-header">
          <div>
            <div class="card-title">${escapeHtml(m.name)}</div>
            <div class="card-meta">${escapeHtml(m.description || '')}</div>
          </div>
          <div>
            <span class="status status-${m.isActive ? 'approved' : 'cancelled'}">${m.isActive ? '有効' : '無効'}</span>
            <span class="step-role-badge">${routeTypeLabels[m.routeType] || m.routeType}</span>
            ${m.isStandard ? '<span class="step-role-badge" style="background:#d4edda;color:#155724;">標準</span>' : ''}
          </div>
        </div>
        <div class="card-footer">
          <span class="card-meta">優先度: ${m.priority}</span>
          <div class="card-actions">
            <button class="btn btn-sm" onclick="event.stopPropagation(); editRouteMaster('${m.id}')">編集</button>
            <button class="btn btn-sm" onclick="event.stopPropagation(); copyRouteMaster('${m.id}')">コピー</button>
            <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteRouteMaster('${m.id}')">削除</button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="empty-state">読み込みに失敗しました</div>';
  }
}

function showNewRouteMasterModal() {
  document.getElementById('routeMasterModalTitle').textContent = '経路マスタ作成';
  document.getElementById('routeMasterEditId').value = '';
  document.getElementById('newRouteMasterForm').reset();
  // ワークフロー選択肢
  const wfSelect = document.getElementById('routeMasterWorkflow');
  wfSelect.innerHTML = '<option value="">選択してください</option>';
  workflows.filter(w => w.isActive).forEach(wf => {
    const opt = document.createElement('option');
    opt.value = wf.id;
    opt.textContent = wf.name;
    wfSelect.appendChild(opt);
  });
  showModal('newRouteMasterModal');
}

async function saveRouteMaster(event) {
  event.preventDefault();
  if (isProcessing) return;
  isProcessing = true;
  const editId = document.getElementById('routeMasterEditId').value;
  const data = {
    name: document.getElementById('routeMasterName').value,
    description: document.getElementById('routeMasterDescription').value,
    workflowId: document.getElementById('routeMasterWorkflow').value,
    routeType: document.getElementById('routeMasterType').value,
    priority: parseInt(document.getElementById('routeMasterPriority').value, 10) || 1,
    isStandard: document.getElementById('routeMasterStandard').checked,
  };
  try {
    const url = editId ? `${API_BASE}/route-masters/${editId}` : `${API_BASE}/route-masters`;
    const method = editId ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error(getErrorMessage(await res.json().catch(() => ({})), '保存に失敗しました'));
    showAlert(editId ? '更新しました' : '作成しました');
    closeModal('newRouteMasterModal');
    loadRouteMasters();
  } catch (err) {
    showAlert(getErrorMessage(err, '保存に失敗しました'));
  } finally {
    isProcessing = false;
  }
}

async function editRouteMaster(id) {
  try {
    const res = await fetch(`${API_BASE}/route-masters/${id}`);
    const data = await res.json();
    const m = data.routeMaster;
    document.getElementById('routeMasterModalTitle').textContent = '経路マスタ編集';
    document.getElementById('routeMasterEditId').value = m.id;
    document.getElementById('routeMasterName').value = m.name;
    document.getElementById('routeMasterDescription').value = m.description || '';
    // ワークフロー選択肢
    const wfSelect = document.getElementById('routeMasterWorkflow');
    wfSelect.innerHTML = '<option value="">選択してください</option>';
    workflows.filter(w => w.isActive).forEach(wf => {
      const opt = document.createElement('option');
      opt.value = wf.id;
      opt.textContent = wf.name;
      if (wf.id === m.workflowId) opt.selected = true;
      wfSelect.appendChild(opt);
    });
    document.getElementById('routeMasterType').value = m.routeType;
    document.getElementById('routeMasterPriority').value = m.priority;
    document.getElementById('routeMasterStandard').checked = m.isStandard;
    showModal('newRouteMasterModal');
  } catch (err) {
    showAlert(getErrorMessage(err, '取得に失敗しました'));
  }
}

async function deleteRouteMaster(id) {
  if (!confirm('この経路マスタを削除しますか？ステップも全て削除されます。')) return;
  try {
    const res = await fetch(`${API_BASE}/route-masters/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('削除に失敗しました');
    showAlert('削除しました');
    loadRouteMasters();
  } catch (err) {
    showAlert(getErrorMessage(err, '削除に失敗しました'));
  }
}

async function copyRouteMaster(id) {
  try {
    const res = await fetch(`${API_BASE}/route-masters/${id}/copy`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
    });
    if (!res.ok) throw new Error('コピーに失敗しました');
    showAlert('コピーしました');
    loadRouteMasters();
  } catch (err) {
    showAlert(getErrorMessage(err, 'コピーに失敗しました'));
  }
}

async function viewRouteMasterDetail(id) {
  try {
    const res = await fetch(`${API_BASE}/route-masters/${id}`);
    const data = await res.json();
    const m = data.routeMaster;
    const routeTypeLabels = { basic: '基本', by_position: '役職別', by_department: '部署別', by_individual: '個人別' };
    const stepRoleLabels = { approver: '承認者', final_approver: '決裁者', handler: '業務担当者', notifier: '通知' };
    const stepTypeLabels = { position: '役職', role: '承認ロール', specific_user: '特定ユーザー' };

    document.getElementById('routeMasterDetailTitle').textContent = m.name;
    document.getElementById('routeMasterDetailContent').innerHTML = `
      <div class="detail-section">
        <h4>基本情報</h4>
        <div class="detail-row"><span class="detail-label">経路タイプ</span><span class="detail-value">${routeTypeLabels[m.routeType] || m.routeType}</span></div>
        <div class="detail-row"><span class="detail-label">優先度</span><span class="detail-value">${m.priority}</span></div>
        <div class="detail-row"><span class="detail-label">標準経路</span><span class="detail-value">${m.isStandard ? 'はい' : 'いいえ'}</span></div>
        <div class="detail-row"><span class="detail-label">状態</span><span class="detail-value">${m.isActive ? '有効' : '無効'}</span></div>
      </div>
      <div class="detail-section">
        <h4>ステップ一覧</h4>
        ${m.steps && m.steps.length > 0 ? m.steps.map((step, i) => `
          <div class="route-step">
            <div class="route-step-number">${i + 1}</div>
            <div class="route-step-info">
              <div class="route-step-label">${escapeHtml(step.label || 'ステップ ' + step.stepOrder)} <span class="step-role-badge">${stepRoleLabels[step.stepRoleType] || ''}</span></div>
              <div class="route-step-approver">${stepTypeLabels[step.stepType] || step.stepType}${step.deadlineDays ? ' / 期限: ' + step.deadlineDays + '日' : ''}</div>
            </div>
          </div>
        `).join('') : '<div class="empty-state" style="padding:16px;">ステップがありません</div>'}
      </div>
      <div class="form-actions">
        <button class="btn" onclick="exportRouteMasterCsv('${m.id}')">CSVエクスポート</button>
        <button class="btn btn-primary" onclick="closeModal('routeMasterDetailModal'); editRouteMaster('${m.id}')">編集</button>
      </div>
    `;
    showModal('routeMasterDetailModal');
  } catch (err) {
    showAlert(getErrorMessage(err, '取得に失敗しました'));
  }
}

function downloadRequestPdf(requestId) {
  window.open(`${API_BASE}/requests/${requestId}/pdf`, '_blank');
}

function exportRouteMasterCsv(id) {
  window.open(`${API_BASE}/route-masters/export/${id}`, '_blank');
}

// ==================== 一括CSV管理 ====================

function exportAllRoutesCsv() {
  const workflowId = document.getElementById('routeMasterWorkflowFilter')?.value || '';
  let url = `${API_BASE}/route-masters/export-all`;
  if (workflowId) url += `?workflowId=${workflowId}`;
  window.open(url, '_blank');
}

function showBulkImportRouteModal() {
  document.getElementById('bulkRouteImportFile').value = '';
  document.getElementById('bulkRouteImportPreview').style.display = 'none';
  document.getElementById('bulkRouteImportPreviewContent').innerHTML = '';
  document.getElementById('bulkRouteImportResult').innerHTML = '';
  document.getElementById('bulkRouteImportBtn').disabled = true;
  showModal('bulkRouteImportModal');
}

let bulkRouteCsvData = null;

function previewBulkRouteImport(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    bulkRouteCsvData = e.target.result;
    const lines = bulkRouteCsvData.replace(/^\uFEFF/, '').split('\n').filter(l => l.trim());
    if (lines.length < 2) {
      document.getElementById('bulkRouteImportResult').innerHTML =
        '<div style="color:var(--danger);">データ行がありません</div>';
      return;
    }

    // ヘッダーをパース
    const headers = parseCSVLine(lines[0]);

    // プレビューテーブル生成
    let html = '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead><tr>' + headers.map(h => `<th style="border:1px solid #ddd;padding:4px 6px;background:#f5f5f5;white-space:nowrap;">${escapeHtml(h)}</th>`).join('') + '</tr></thead>';
    html += '<tbody>';

    const maxPreview = Math.min(lines.length, 21); // 最大20行
    let routeCount = 0;
    for (let i = 1; i < maxPreview; i++) {
      const vals = parseCSVLine(lines[i]);
      const isRouteHeader = vals[0]?.trim();
      if (isRouteHeader) routeCount++;
      html += `<tr style="${isRouteHeader ? 'background:#e8f4fd;font-weight:500;' : ''}">`;
      html += vals.map(v => `<td style="border:1px solid #ddd;padding:3px 6px;white-space:nowrap;">${escapeHtml(v || '')}</td>`).join('');
      html += '</tr>';
    }
    html += '</tbody></table>';

    if (lines.length > 21) {
      html += `<div style="padding:8px;color:#666;font-size:12px;">...他 ${lines.length - 21} 行</div>`;
    }

    const totalSteps = lines.length - 1;
    document.getElementById('bulkRouteImportPreviewContent').innerHTML = html;
    document.getElementById('bulkRouteImportPreview').style.display = 'block';
    document.getElementById('bulkRouteImportResult').innerHTML =
      `<div style="color:#333;">経路数: <strong>${routeCount}</strong>、全ステップ行: <strong>${totalSteps}</strong></div>`;
    document.getElementById('bulkRouteImportBtn').disabled = false;
  };
  reader.readAsText(file, 'UTF-8');
}

// 簡易CSVパーサー（ダブルクォート対応）
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

async function executeBulkRouteImport() {
  if (!bulkRouteCsvData || isProcessing) return;
  isProcessing = true;
  const btn = document.getElementById('bulkRouteImportBtn');
  btn.disabled = true;
  btn.textContent = 'インポート中...';
  const resultDiv = document.getElementById('bulkRouteImportResult');

  try {
    const res = await fetch(`${API_BASE}/route-masters/import-bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvData: bulkRouteCsvData }),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'インポートに失敗しました');
    }

    let html = '<div style="margin-top:8px;">';
    html += `<div style="color:var(--success);font-weight:500;">インポート完了</div>`;
    html += `<div>新規作成: <strong>${data.created}</strong>件、更新: <strong>${data.updated}</strong>件`;
    if (data.skipped > 0) html += `、スキップ: <strong>${data.skipped}</strong>件`;
    html += `</div>`;
    html += `<div>合計ステップ数: <strong>${data.totalSteps}</strong></div>`;

    if (data.errors && data.errors.length > 0) {
      html += '<div style="margin-top:8px;color:var(--danger);">エラー:</div>';
      html += '<ul style="margin:4px 0;padding-left:20px;font-size:12px;">';
      data.errors.forEach(err => {
        html += `<li>行${err.row}: ${escapeHtml(err.message)}</li>`;
      });
      html += '</ul>';
    }
    html += '</div>';
    resultDiv.innerHTML = html;

    // 経路マスタリストを更新
    loadRouteMasters();
  } catch (err) {
    resultDiv.innerHTML = `<div style="color:var(--danger);">${escapeHtml(getErrorMessage(err, 'インポートに失敗しました'))}</div>`;
  } finally {
    isProcessing = false;
    btn.disabled = false;
    btn.textContent = 'インポート実行';
  }
}

// ==================== ワークフロー管理 ====================
function showNewWorkflowModal() {
  document.getElementById('workflowForm').reset();
  document.getElementById('editWorkflowId').value = '';
  document.getElementById('workflowModalTitle').textContent = '新規ワークフロー';
  document.getElementById('wfIsActive').checked = true;
  showModal('newWorkflowModal');
}

async function saveWorkflow(event) {
  event.preventDefault();
  if (!isManager()) { showAlert('権限がありません'); return; }
  if (isProcessing) return;
  isProcessing = true;
  const editId = document.getElementById('editWorkflowId').value;
  const payload = {
    name: document.getElementById('wfName').value,
    category: document.getElementById('wfCategory').value,
    description: document.getElementById('wfDescription').value,
    isActive: document.getElementById('wfIsActive').checked,
  };
  try {
    const method = editId ? 'PUT' : 'POST';
    const url = editId ? `${API_BASE}/workflows/${editId}` : `${API_BASE}/workflows`;
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(getErrorMessage(await res.json().catch(() => ({})), '保存に失敗しました'));
    showAlert(editId ? 'ワークフローを更新しました' : 'ワークフローを作成しました');
    closeModal('newWorkflowModal');
    loadWorkflowsList();
    loadWorkflows(); // ドロップダウン更新
  } catch (err) {
    showAlert(getErrorMessage(err, '保存に失敗しました'));
  } finally {
    isProcessing = false;
  }
}

async function viewWorkflowDetail(id) {
  try {
    const res = await fetch(`${API_BASE}/workflows/${id}`);
    const data = await res.json();
    const wf = data.workflow;
    const steps = wf.steps || [];
    document.getElementById('workflowDetailTitle').textContent = wf.name;
    document.getElementById('workflowDetailContent').innerHTML = `
      <div class="detail-section">
        <h4>基本情報</h4>
        <div class="detail-row"><span class="detail-label">カテゴリ</span><span class="detail-value">${escapeHtml(wf.category || '一般')}</span></div>
        <div class="detail-row"><span class="detail-label">説明</span><span class="detail-value">${escapeHtml(wf.description || '-')}</span></div>
        <div class="detail-row"><span class="detail-label">状態</span><span class="detail-value"><span class="badge ${wf.isActive ? 'badge-active' : 'badge-inactive'}">${wf.isActive ? '有効' : '無効'}</span></span></div>
      </div>
      <div class="detail-section">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h4>承認ステップ</h4>
          ${isManager() ? `<button class="btn btn-sm btn-primary" onclick="showAddStepModal('${wf.id}', ${steps.length + 1})">+ ステップ追加</button>` : ''}
        </div>
        ${steps.length === 0 ? '<p>ステップが未設定です</p>' : `
          <div class="step-list">
            ${steps.map(step => `
              <div class="step-card">
                <div class="step-number">${step.stepOrder}</div>
                <div class="step-info">
                  <div class="step-label">${escapeHtml(step.label || 'ステップ ' + step.stepOrder)}</div>
                  <div class="step-meta">${getStepTypeLabel(step.stepType)}${step.skipIfSamePerson ? ' | 同一人物スキップ' : ''}${step.skipIfVacant ? ' | 空席スキップ' : ''}${step.isRequired ? '' : ' | 任意'}</div>
                </div>
                ${isManager() ? `<button class="btn btn-sm btn-danger" onclick="deleteStep('${wf.id}', '${step.id}')">削除</button>` : ''}
              </div>
            `).join('')}
          </div>
        `}
      </div>
      <div class="form-actions">
        ${isManager() ? `
        <button class="btn" onclick="editWorkflowFromDetail('${wf.id}')">編集</button>
        <button class="btn" onclick="copyWorkflow('${wf.id}')">コピー</button>
        <button class="btn btn-danger" onclick="deleteWorkflow('${wf.id}')">削除</button>
        ` : ''}
      </div>
    `;
    showModal('workflowDetailModal');
  } catch (err) {
    showAlert('ワークフローの取得に失敗しました');
  }
}

function editWorkflowFromDetail(id) {
  const wf = workflows.find(w => w.id === id);
  if (!wf) return;
  document.getElementById('editWorkflowId').value = wf.id;
  document.getElementById('workflowModalTitle').textContent = 'ワークフロー編集';
  document.getElementById('wfName').value = wf.name;
  document.getElementById('wfCategory').value = wf.category || '一般';
  document.getElementById('wfDescription').value = wf.description || '';
  document.getElementById('wfIsActive').checked = wf.isActive;
  closeModal('workflowDetailModal');
  showModal('newWorkflowModal');
}

async function deleteWorkflow(id) {
  if (!confirm('このワークフローを削除しますか？')) return;
  try {
    const res = await fetch(`${API_BASE}/workflows/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(getErrorMessage(await res.json().catch(() => ({})), '削除に失敗しました'));
    showAlert('削除しました');
    closeModal('workflowDetailModal');
    loadWorkflowsList();
    loadWorkflows();
  } catch (err) {
    showAlert(getErrorMessage(err, '削除に失敗しました'));
  }
}

async function copyWorkflow(id) {
  const name = prompt('コピー先ワークフロー名:');
  if (!name) return;
  try {
    const res = await fetch(`${API_BASE}/workflows/${id}/copy`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (!res.ok) throw new Error('コピーに失敗しました');
    showAlert('コピーしました');
    closeModal('workflowDetailModal');
    loadWorkflowsList();
    loadWorkflows();
  } catch (err) {
    showAlert(getErrorMessage(err, 'コピーに失敗しました'));
  }
}

function showAddStepModal(workflowId, nextOrder) {
  document.getElementById('addStepForm').reset();
  document.getElementById('stepWorkflowId').value = workflowId;
  document.getElementById('stepOrder').value = nextOrder;
  document.getElementById('stepIsRequired').checked = true;
  onStepTypeChange();
  // ユーザー選択肢をセット
  const select = document.getElementById('stepUserId');
  select.innerHTML = '<option value="">選択してください</option>';
  users.forEach(u => { select.innerHTML += `<option value="${u.id}">${escapeHtml(u.name)}</option>`; });
  // 承認ロール選択肢をセット
  const roleSelect = document.getElementById('stepRoleName');
  roleSelect.innerHTML = '<option value="">選択してください</option>';
  approvalRoles.filter(r => r.isActive).forEach(r => {
    roleSelect.innerHTML += `<option value="${escapeHtml(r.name)}">${escapeHtml(r.name)}</option>`;
  });
  showModal('addStepModal');
}

function onStepTypeChange() {
  const type = document.getElementById('stepType').value;
  document.getElementById('stepPositionGroup').style.display = type === 'position' ? '' : 'none';
  document.getElementById('stepRoleGroup').style.display = type === 'role' ? '' : 'none';
  document.getElementById('stepUserGroup').style.display = type === 'specific_user' ? '' : 'none';
}

async function saveStep(event) {
  event.preventDefault();
  if (isProcessing) return;
  isProcessing = true;
  const workflowId = document.getElementById('stepWorkflowId').value;
  const stepType = document.getElementById('stepType').value;
  const payload = {
    stepOrder: Number(document.getElementById('stepOrder').value),
    stepType,
    positionId: stepType === 'position' ? document.getElementById('stepPositionName').value : undefined,
    approvalRoleId: stepType === 'role' ? document.getElementById('stepRoleName').value : undefined,
    specificUserId: stepType === 'specific_user' ? document.getElementById('stepUserId').value : undefined,
    label: document.getElementById('stepLabel').value || `ステップ${document.getElementById('stepOrder').value}`,
    isRequired: document.getElementById('stepIsRequired').checked,
    skipIfSamePerson: document.getElementById('stepSkipSamePerson').checked,
    skipIfVacant: document.getElementById('stepSkipVacant').checked,
  };
  try {
    const res = await fetch(`${API_BASE}/workflows/${workflowId}/steps`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(getErrorMessage(await res.json().catch(() => ({})), 'ステップ追加に失敗しました'));
    showAlert('ステップを追加しました');
    closeModal('addStepModal');
    viewWorkflowDetail(workflowId);
  } catch (err) {
    showAlert(getErrorMessage(err, 'ステップ追加に失敗しました'));
  } finally {
    isProcessing = false;
  }
}

async function deleteStep(workflowId, stepId) {
  if (!confirm('このステップを削除しますか？')) return;
  try {
    const res = await fetch(`${API_BASE}/workflows/${workflowId}/steps/${stepId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('削除に失敗しました');
    viewWorkflowDetail(workflowId);
  } catch (err) {
    showAlert(getErrorMessage(err, 'ステップ削除に失敗しました'));
  }
}

// ==================== 承認ロール管理 ====================

async function loadApprovalRoleData() {
  try {
    const res = await fetch(`${API_BASE}/approval-roles`);
    const data = await res.json();
    approvalRoles = data.approvalRoles || [];
  } catch (err) {
    console.error('Failed to load approval roles:', err);
  }
}

async function loadApprovalRoles() {
  const container = document.getElementById('approvalRolesList');
  container.innerHTML = '<div class="loading">読み込み中...</div>';
  try {
    const res = await fetch(`${API_BASE}/approval-roles`);
    const data = await res.json();
    approvalRoles = data.approvalRoles || [];
    if (approvalRoles.length === 0) {
      container.innerHTML = '<div class="empty-state">承認ロールがありません</div>';
      return;
    }
    container.innerHTML = approvalRoles.map(role => `
      <div class="card" style="cursor:pointer;" onclick="viewApprovalRoleDetail('${role.id}')">
        <div class="workflow-info">
          <h3>${escapeHtml(role.name)}</h3>
          <p>${escapeHtml(role.description || '')}</p>
          <div class="workflow-steps">
            <span class="badge ${role.isActive ? 'badge-active' : 'badge-inactive'}">${role.isActive ? '有効' : '無効'}</span>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="empty-state">読み込みに失敗しました</div>';
  }
}

function showNewApprovalRoleModal() {
  document.getElementById('newApprovalRoleForm').reset();
  document.getElementById('approvalRoleEditId').value = '';
  document.getElementById('approvalRoleModalTitle').textContent = '承認ロール作成';
  document.getElementById('approvalRoleIsActive').checked = true;
  showModal('newApprovalRoleModal');
}

async function editApprovalRole(id) {
  try {
    const res = await fetch(`${API_BASE}/approval-roles/${id}`);
    const data = await res.json();
    const role = data.approvalRole;
    document.getElementById('approvalRoleEditId').value = role.id;
    document.getElementById('approvalRoleName').value = role.name;
    document.getElementById('approvalRoleDescription').value = role.description || '';
    document.getElementById('approvalRoleIsActive').checked = role.isActive;
    document.getElementById('approvalRoleModalTitle').textContent = '承認ロール編集';
    showModal('newApprovalRoleModal');
  } catch (err) {
    showAlert(getErrorMessage(err, '承認ロール情報の取得に失敗しました'));
  }
}

async function saveApprovalRole(event) {
  event.preventDefault();
  if (isProcessing) return;
  isProcessing = true;
  const editId = document.getElementById('approvalRoleEditId').value;
  const payload = {
    name: document.getElementById('approvalRoleName').value.trim(),
    description: document.getElementById('approvalRoleDescription').value.trim(),
    isActive: document.getElementById('approvalRoleIsActive').checked,
  };
  try {
    const url = editId ? `${API_BASE}/approval-roles/${editId}` : `${API_BASE}/approval-roles`;
    const method = editId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: apiHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(getErrorMessage(await res.json().catch(() => ({})), '保存に失敗しました'));
    showAlert(editId ? '承認ロールを更新しました' : '承認ロールを作成しました');
    closeModal('newApprovalRoleModal');
    loadApprovalRoles();
  } catch (err) {
    showAlert(getErrorMessage(err, '保存に失敗しました'));
  } finally {
    isProcessing = false;
  }
}

async function deleteApprovalRole(id) {
  if (!confirm('この承認ロールを削除しますか？')) return;
  try {
    const res = await fetch(`${API_BASE}/approval-roles/${id}`, {
      method: 'DELETE',
      headers: apiHeaders(),
    });
    if (!res.ok) throw new Error(getErrorMessage(await res.json().catch(() => ({})), '削除に失敗しました'));
    showAlert('承認ロールを削除しました');
    closeModal('approvalRoleDetailModal');
    loadApprovalRoles();
  } catch (err) {
    showAlert(getErrorMessage(err, '削除に失敗しました'));
  }
}

async function viewApprovalRoleDetail(id) {
  const content = document.getElementById('approvalRoleDetailContent');
  content.innerHTML = '<div class="loading">読み込み中...</div>';
  showModal('approvalRoleDetailModal');
  try {
    const res = await fetch(`${API_BASE}/approval-roles/${id}`);
    const data = await res.json();
    const role = data.approvalRole;
    const members = data.members || [];
    document.getElementById('approvalRoleDetailTitle').textContent = role.name;

    let html = `
      <div style="margin-bottom: 16px;">
        <p><strong>説明:</strong> ${escapeHtml(role.description || 'なし')}</p>
        <p><strong>状態:</strong> <span class="badge ${role.isActive ? 'badge-active' : 'badge-inactive'}">${role.isActive ? '有効' : '無効'}</span></p>
        <div style="margin-top: 8px;">
          <button class="btn btn-sm" onclick="editApprovalRole('${role.id}')">編集</button>
          <button class="btn btn-sm btn-danger" onclick="deleteApprovalRole('${role.id}')">削除</button>
        </div>
      </div>
      <hr>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
        <h4>割り当てメンバー (${members.length})</h4>
        <button class="btn btn-sm btn-primary" onclick="showAddMemberModal('${escapeHtml(role.name)}')">+ メンバー追加</button>
      </div>
    `;

    if (members.length === 0) {
      html += '<p style="color: var(--text-muted);">メンバーが割り当てられていません</p>';
    } else {
      html += '<div class="list">';
      members.forEach(m => {
        html += `
          <div class="card" style="padding: 8px 12px; display:flex; justify-content:space-between; align-items:center;">
            <span>${escapeHtml(m.name)} (${escapeHtml(m.email)})</span>
            <button class="btn btn-sm btn-danger" onclick="removeMemberFromRole('${m.id}', '${escapeHtml(role.name)}')">解除</button>
          </div>
        `;
      });
      html += '</div>';
    }

    content.innerHTML = html;
  } catch (err) {
    content.innerHTML = '<div class="empty-state">読み込みに失敗しました</div>';
  }
}

function showAddMemberModal(roleName) {
  document.getElementById('addApprovalRoleMemberForm').reset();
  document.getElementById('memberRoleName').value = roleName;
  const select = document.getElementById('memberUserId');
  select.innerHTML = '<option value="">選択してください</option>';
  users.forEach(u => {
    if (u.isActive !== false) {
      select.innerHTML += `<option value="${u.id}">${escapeHtml(u.name)} (${escapeHtml(u.email)})</option>`;
    }
  });
  showModal('addApprovalRoleMemberModal');
}

async function saveApprovalRoleMember(event) {
  event.preventDefault();
  if (isProcessing) return;
  isProcessing = true;
  const userId = document.getElementById('memberUserId').value;
  const roleName = document.getElementById('memberRoleName').value;
  const payload = {
    approvalRoleName: roleName,
    targetOrganizationCode: document.getElementById('memberTargetOrg').value || undefined,
    validFrom: document.getElementById('memberValidFrom').value || undefined,
    validTo: document.getElementById('memberValidTo').value || undefined,
  };
  try {
    const res = await fetch(`${API_BASE}/users/${userId}/approval-roles`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(getErrorMessage(await res.json().catch(() => ({})), 'メンバー追加に失敗しました'));
    showAlert('メンバーを追加しました');
    closeModal('addApprovalRoleMemberModal');
    // 詳細を再表示するために承認ロールを探す
    const role = approvalRoles.find(r => r.name === roleName);
    if (role) viewApprovalRoleDetail(role.id);
  } catch (err) {
    showAlert(getErrorMessage(err, 'メンバー追加に失敗しました'));
  } finally {
    isProcessing = false;
  }
}

async function removeMemberFromRole(userId, roleName) {
  if (!confirm('このメンバーを承認ロールから解除しますか？')) return;
  try {
    // ユーザーの承認ロール一覧から該当レコードを探す
    const rolesRes = await fetch(`${API_BASE}/users/${userId}/approval-roles`);
    const rolesData = await rolesRes.json();
    const match = (rolesData.approvalRoles || []).find(r => r.approvalRoleId === roleName);
    if (!match) {
      showAlert('該当する割り当てが見つかりません');
      return;
    }
    const res = await fetch(`${API_BASE}/users/${userId}/approval-roles/${match.id}`, {
      method: 'DELETE',
      headers: apiHeaders(),
    });
    if (!res.ok) throw new Error(getErrorMessage(await res.json().catch(() => ({})), '解除に失敗しました'));
    showAlert('メンバーを解除しました');
    // 詳細を再表示
    const role = approvalRoles.find(r => r.name === roleName);
    if (role) viewApprovalRoleDetail(role.id);
  } catch (err) {
    showAlert(getErrorMessage(err, '解除に失敗しました'));
  }
}

// ==================== Lark同期 ====================
async function syncFromLark(btn) {
  if (!isManager()) { showAlert('権限がありません'); return; }
  if (isProcessing) return;
  isProcessing = true;
  setButtonLoading(btn, true);
  const resultDiv = document.getElementById('syncFromLarkResult');
  resultDiv.innerHTML = '<div class="loading">同期中...</div>';

  try {
    const res = await fetch(`${API_BASE}/users/sync-from-lark`, {
      method: 'POST',
      headers: apiHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(getErrorMessage(data, '同期に失敗しました'));

    const d = data.departments || {};
    const u = data.users || {};
    resultDiv.innerHTML = `
      <div class="import-success">
        <strong>同期完了</strong><br>
        部署: 作成 ${d.created || 0}件, 更新 ${d.updated || 0}件, 無効化 ${d.deactivated || 0}件<br>
        ユーザー: 作成 ${u.created || 0}件, 更新 ${u.updated || 0}件, 無効化 ${u.deactivated || 0}件, 変更なし ${u.unchanged || 0}件
      </div>
    `;
  } catch (err) {
    resultDiv.innerHTML = `<div class="import-error">同期に失敗しました: ${escapeHtml(getErrorMessage(err, '不明なエラー'))}</div>`;
  } finally {
    isProcessing = false;
    setButtonLoading(btn, false);
  }
}

// ==================== CSVインポート ====================
async function importCSV(type, inputEl) {
  if (!isManager()) { showAlert('権限がありません'); return; }
  const file = inputEl.files[0];
  if (!file) return;
  const resultDiv = document.getElementById(`import${type.charAt(0).toUpperCase() + type.slice(1)}Result`);
  resultDiv.innerHTML = '<div class="loading">プレビュー中...</div>';

  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', type);

  try {
    // まずプレビュー
    const previewRes = await fetch(`${API_BASE}/import/preview`, { method: 'POST', body: formData });
    const preview = await previewRes.json();

    if (!preview.success) {
      resultDiv.innerHTML = `<div class="import-error">エラー: ${preview.errorRows}行に問題があります<br>${(preview.errors || []).slice(0, 5).map(e => `行${e.row}: ${e.column} - ${e.message}`).join('<br>')}</div>`;
      inputEl.value = '';
      return;
    }

    resultDiv.innerHTML = `
      <div class="import-preview">
        <p>有効: ${preview.validRows}件 / エラー: ${preview.errorRows}件</p>
        <button class="btn btn-sm btn-primary" onclick="executeImport('${type}', this)">インポート実行</button>
      </div>
    `;
    // ファイルをdata属性に保存
    resultDiv.dataset.pendingFile = file.name;
    resultDiv._pendingFile = file;
  } catch (err) {
    resultDiv.innerHTML = '<div class="import-error">プレビューに失敗しました</div>';
  }
  inputEl.value = '';
}

async function executeImport(type, btn) {
  const resultDiv = document.getElementById(`import${type.charAt(0).toUpperCase() + type.slice(1)}Result`);
  const file = resultDiv._pendingFile;
  if (!file) { resultDiv.innerHTML = '<div class="import-error">ファイルを再選択してください</div>'; return; }

  btn.disabled = true;
  btn.textContent = 'インポート中...';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`${API_BASE}/import/${type}`, { method: 'POST', body: formData });
    const data = await res.json();
    if (data.success) {
      resultDiv.innerHTML = `<div class="import-success">${data.message}</div>`;
    } else {
      resultDiv.innerHTML = `<div class="import-error">インポートに失敗しました: ${(data.errors || []).slice(0, 3).map(e => e.message).join(', ')}</div>`;
    }
  } catch (err) {
    resultDiv.innerHTML = '<div class="import-error">インポートに失敗しました</div>';
  }
  resultDiv._pendingFile = null;
}

// ==================== Modal helpers ====================
function showModal(id) {
  document.getElementById(id).classList.add('show');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

function showAlert(message) {
  document.getElementById('customAlertMessage').textContent = message;
  document.getElementById('customAlertModal').classList.add('show');
}

function closeCustomAlert() {
  document.getElementById('customAlertModal').classList.remove('show');
}

// ==================== Utilities ====================
function getErrorMessage(err, defaultMsg = 'エラーが発生しました') {
  if (!err) return defaultMsg;
  if (typeof err === 'string') return err;
  if (typeof err.message === 'string') return err.message;
  if (typeof err.error === 'string') return err.error;
  if (err.error && typeof err.error === 'object') {
    if (Array.isArray(err.error.issues) && err.error.issues.length > 0) return err.error.issues.map(i => i.message).join(', ');
    if (err.error.name === 'ZodError' && err.error.message) return typeof err.error.message === 'string' ? err.error.message : defaultMsg;
  }
  if (err.success === false && err.error) return getErrorMessage(err.error, defaultMsg);
  return defaultMsg;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatCurrency(n) {
  if (n == null) return '0';
  return Number(n).toLocaleString('ja-JP');
}

function getStatusLabel(status) {
  const labels = { draft: '下書き', pending: '承認待ち', approved: '承認完了', rejected: '却下', remanded: '差戻し', cancelled: '取消し', withdrawn: '取り下げ', conditional_approve_wait: 'コメント待ち' };
  return labels[status] || status;
}

function getStepStatusLabel(status) {
  const labels = { pending: '承認待ち', approved: '承認済み', rejected: '却下', skipped: 'スキップ', waiting: '待機中' };
  return labels[status] || status;
}

function getSkipReasonLabel(reason) {
  const labels = { vacant: '空席のためスキップ', same_person: '同一人物のためスキップ', not_required: '条件不該当のためスキップ' };
  return labels[reason] || reason;
}

function getStepTypeLabel(type) {
  const labels = { position: '役職による承認', role: '承認ロールによる承認', specific: '特定ユーザーによる承認' };
  return labels[type] || type;
}

function getStepRoleLabel(roleType) {
  const labels = { approver: '承認者', final_approver: '決裁者', handler: '業務担当者', notifier: '通知' };
  return labels[roleType] || '';
}

function getActionLabel(action) {
  const labels = { approve: '承認', reject: '却下', remand: '差戻し', skip: 'スキップ', pull_up: '引き上げ', conditional_approve: '条件付承認', notify_complete: '通知完了', withdraw: '取り下げ' };
  return labels[action] || action;
}

function getActionIcon(action) {
  const icons = { approve: '✓', reject: '✗', remand: '↩', skip: '⏭', pull_up: '⬆', conditional_approve: '✓', notify_complete: '📢', withdraw: '↺' };
  return icons[action] || '•';
}
