// State
let currentUser = null;
let users = [];
let workflows = [];
let larkUser = null;
let isLarkEnvironment = false;

// API Base URL
const API_BASE = '/api';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  initTabs();

  // Check for force logout
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('logout') === '1') {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('larkUser');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Check if running inside Lark (multiple detection methods)
  const inLark = window.h5sdk || window.tt || window.lark ||
                 navigator.userAgent.includes('Lark') ||
                 navigator.userAgent.includes('Feishu');

  if (inLark) {
    isLarkEnvironment = true;
    // Hide user selector immediately in Lark environment
    const userInfoDiv = document.getElementById('userInfo');
    userInfoDiv.innerHTML = '<span class="lark-user">認証中...</span>';

    // Check for OAuth callback code in URL
    const code = urlParams.get('code');

    if (code) {
      // Handle OAuth callback
      await handleOAuthCallback(code);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      // Check if we have a saved session
      const savedUser = localStorage.getItem('currentUser');
      if (savedUser) {
        try {
          currentUser = JSON.parse(savedUser);
          const larkUserData = localStorage.getItem('larkUser');
          if (larkUserData) {
            larkUser = JSON.parse(larkUserData);
          }
          showCurrentUser();
          loadRequests();
          loadApprovals();
        } catch (e) {
          console.error('Failed to parse saved user:', e);
          localStorage.removeItem('currentUser');
          localStorage.removeItem('larkUser');
          startOAuthFlow();
        }
      } else {
        // No session - start OAuth flow
        console.log('No saved session, starting OAuth flow...');
        startOAuthFlow();
      }
    }
  } else {
    // Not in Lark - show user selector for development
    console.log('Not running in Lark environment');
    loadUsers();
  }

  loadWorkflows();
});

// Start OAuth authentication flow
async function startOAuthFlow() {
  const userInfoDiv = document.getElementById('userInfo');
  userInfoDiv.innerHTML = '<span class="lark-user">OAuth認証開始中...</span>';

  try {
    console.log('Fetching auth URL from:', `${API_BASE}/auth/login`);
    const res = await fetch(`${API_BASE}/auth/login`);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    console.log('Auth response:', data);

    if (data.authUrl) {
      // Redirect to Lark OAuth
      console.log('Redirecting to:', data.authUrl);
      window.location.href = data.authUrl;
    } else {
      userInfoDiv.innerHTML = '<span class="lark-user" style="color: var(--danger);">認証エラー</span>';
      showError('認証URLの取得に失敗しました');
    }
  } catch (err) {
    console.error('Failed to start OAuth flow:', err);
    userInfoDiv.innerHTML = '<span class="lark-user" style="color: var(--danger);">認証エラー</span>';
    showError('認証の開始に失敗しました: ' + err.message);
  }
}

// Handle OAuth callback
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

      // Save to localStorage
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      localStorage.setItem('larkUser', JSON.stringify(larkUser));

      showCurrentUser();
      loadRequests();
      loadApprovals();
    } else {
      console.error('OAuth callback failed:', data);
      showError(data.message || '認証に失敗しました');
    }
  } catch (err) {
    console.error('OAuth callback error:', err);
    showError('認証処理中にエラーが発生しました: ' + err.message);
  }
}

// Show current user info
function showCurrentUser() {
  const userInfoDiv = document.getElementById('userInfo');
  const displayName = larkUser?.name || currentUser?.name || 'ユーザー';
  userInfoDiv.innerHTML = `
    <span class="lark-user">
      ${escapeHtml(displayName)}
    </span>
  `;
}

// Logout function
function logout() {
  localStorage.removeItem('currentUser');
  localStorage.removeItem('larkUser');
  currentUser = null;
  larkUser = null;
  startOAuthFlow();
}

// Sync Lark user with our system
async function syncLarkUser(larkUserInfo) {
  try {
    // Try to find user by Lark ID
    const res = await fetch(`${API_BASE}/users/lark/${larkUserInfo.userId || larkUserInfo.openId}`);
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
    } else {
      // User not found - show error
      console.warn('User not registered in system');
      showError('このユーザーはシステムに登録されていません。管理者にお問い合わせください。');
    }
  } catch (err) {
    console.error('Failed to sync Lark user:', err);
  }
}

// Show error message
function showError(message) {
  const main = document.querySelector('.main');
  main.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">&#9888;</div>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

// Tab switching
function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');

      // Load data for the selected tab
      if (tab.dataset.tab === 'requests') loadRequests();
      if (tab.dataset.tab === 'approvals') loadApprovals();
      if (tab.dataset.tab === 'workflows') loadWorkflowsList();
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

    // Auto-select first user for demo
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
  const userId = select.value;
  currentUser = users.find(u => u.id === userId) || null;

  if (currentUser) {
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
    const workflows = data.workflows || [];

    if (workflows.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div>ワークフローがありません</div>';
      return;
    }

    container.innerHTML = workflows.map(workflow => `
      <div class="card workflow-card">
        <div class="workflow-info">
          <h3>${escapeHtml(workflow.name)}</h3>
          <p>${escapeHtml(workflow.description || '')}</p>
          <div class="workflow-steps">
            <span class="badge">${workflow.category || '一般'}</span>
            <span class="badge ${workflow.isActive ? 'badge-active' : 'badge-inactive'}">
              ${workflow.isActive ? '有効' : '無効'}
            </span>
          </div>
        </div>
        <button class="btn btn-sm" onclick="viewWorkflow('${workflow.id}')">詳細</button>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="empty-state">読み込みに失敗しました</div>';
  }
}

async function viewWorkflow(workflowId) {
  try {
    const res = await fetch(`${API_BASE}/workflows/${workflowId}`);
    const data = await res.json();
    const workflow = data.workflow;

    alert(`ワークフロー: ${workflow.name}\nステップ数: ${workflow.steps?.length || 0}`);
  } catch (err) {
    alert('ワークフローの取得に失敗しました');
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
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div>申請がありません</div>';
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
            <button class="btn btn-sm" onclick="viewRequest('${request.id}')">詳細</button>
            ${request.status === 'draft' ? `
              <button class="btn btn-sm btn-primary" onclick="submitRequest('${request.id}')">提出</button>
            ` : ''}
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="empty-state">読み込みに失敗しました</div>';
  }
}

// Approvals
async function loadApprovals() {
  if (!currentUser) return;

  const container = document.getElementById('approvalsList');
  container.innerHTML = '<div class="loading">読み込み中...</div>';

  try {
    const res = await fetch(`${API_BASE}/requests/pending?approverId=${currentUser.id}`);
    const data = await res.json();
    const requests = data.requests || [];

    if (requests.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div>承認待ちの申請はありません</div>';
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
            <button class="btn btn-sm" onclick="viewRequest('${request.id}')">詳細</button>
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

// View request detail
async function viewRequest(requestId) {
  try {
    const [requestRes, routeRes, historyRes] = await Promise.all([
      fetch(`${API_BASE}/requests/${requestId}`),
      fetch(`${API_BASE}/requests/${requestId}/route`),
      fetch(`${API_BASE}/requests/${requestId}/history`)
    ]);

    const requestData = await requestRes.json();
    const routeData = await routeRes.json();
    const historyData = await historyRes.json();

    const request = requestData.request;
    const route = routeData.route || [];
    const history = historyData.history || [];

    document.getElementById('detailTitle').textContent = request.title;
    document.getElementById('requestDetail').innerHTML = `
      <div class="detail-section">
        <h4>基本情報</h4>
        <div class="detail-row">
          <span class="detail-label">ステータス</span>
          <span class="detail-value"><span class="status status-${request.status}">${getStatusLabel(request.status)}</span></span>
        </div>
        <div class="detail-row">
          <span class="detail-label">作成日</span>
          <span class="detail-value">${formatDate(request.createdAt)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">提出日</span>
          <span class="detail-value">${request.submittedAt ? formatDate(request.submittedAt) : '-'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">完了日</span>
          <span class="detail-value">${request.completedAt ? formatDate(request.completedAt) : '-'}</span>
        </div>
      </div>

      <div class="detail-section">
        <h4>承認ルート</h4>
        ${route.map((step, index) => `
          <div class="route-step">
            <div class="route-step-number ${step.status}">${index + 1}</div>
            <div class="route-step-info">
              <div class="route-step-label">${escapeHtml(step.label || `ステップ ${step.stepOrder}`)}</div>
              <div class="route-step-approver">
                ${step.approver ? escapeHtml(step.approver.name) : (step.skipReason ? getSkipReasonLabel(step.skipReason) : '未割当')}
              </div>
            </div>
            <span class="route-step-status status status-${step.status}">${getStepStatusLabel(step.status)}</span>
          </div>
        `).join('')}
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
                  ${h.skipReason ? `<div class="timeline-skip-reason">${getSkipReasonLabel(h.skipReason)}</div>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${request.status === 'draft' ? `
        <div class="form-actions">
          <button class="btn btn-primary" onclick="submitRequest('${request.id}'); closeModal('requestDetailModal');">提出する</button>
        </div>
      ` : ''}

      ${request.status === 'pending' && currentUser ? `
        <div class="form-actions">
          <button class="btn btn-success" onclick="showApprovalAction('${request.id}', 'approve'); closeModal('requestDetailModal');">承認</button>
          <button class="btn btn-danger" onclick="showApprovalAction('${request.id}', 'reject'); closeModal('requestDetailModal');">却下</button>
          <button class="btn btn-warning" onclick="showApprovalAction('${request.id}', 'remand'); closeModal('requestDetailModal');">差戻し</button>
        </div>
      ` : ''}
    `;

    showModal('requestDetailModal');
  } catch (err) {
    alert('申請の取得に失敗しました');
  }
}

// New request
function showNewRequestModal() {
  if (!currentUser) {
    alert('ユーザーを選択してください');
    return;
  }

  document.getElementById('newRequestForm').reset();
  document.getElementById('approvalRoutePreview').style.display = 'none';
  showModal('newRequestModal');
}

// Current workflow form schema
let currentFormSchema = null;

async function onWorkflowSelect() {
  const workflowId = document.getElementById('workflowSelect').value;
  const preview = document.getElementById('approvalRoutePreview');
  const dynamicFields = document.getElementById('dynamicFormFields');

  if (!workflowId) {
    preview.style.display = 'none';
    if (dynamicFields) dynamicFields.innerHTML = '';
    currentFormSchema = null;
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/workflows/${workflowId}`);
    const data = await res.json();
    const workflow = data.workflow;
    const steps = workflow.steps || [];

    // Render dynamic form fields
    currentFormSchema = workflow.formSchema;
    if (dynamicFields) {
      dynamicFields.innerHTML = renderFormFields(workflow.formSchema);
    }

    // Render approval route preview
    if (steps.length > 0) {
      document.getElementById('routeSteps').innerHTML = steps.map((step, index) => `
        <div class="route-step">
          <div class="route-step-number">${index + 1}</div>
          <div class="route-step-info">
            <div class="route-step-label">${escapeHtml(step.label || `ステップ ${step.stepOrder}`)}</div>
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

// Render dynamic form fields from schema
function renderFormFields(formSchema) {
  if (!formSchema || !formSchema.fields || formSchema.fields.length === 0) {
    return '';
  }

  return formSchema.fields.map(field => {
    const required = field.required ? 'required' : '';
    const requiredMark = field.required ? '<span style="color: var(--danger);">*</span>' : '';

    switch (field.type) {
      case 'text':
        return `
          <div class="form-group">
            <label for="field_${field.name}">${escapeHtml(field.label)} ${requiredMark}</label>
            <input type="text" id="field_${field.name}" name="${field.name}"
              placeholder="${escapeHtml(field.placeholder || '')}"
              ${field.validation?.max ? `maxlength="${field.validation.max}"` : ''}
              ${required}>
          </div>
        `;

      case 'number':
        return `
          <div class="form-group">
            <label for="field_${field.name}">${escapeHtml(field.label)} ${requiredMark}</label>
            <input type="number" id="field_${field.name}" name="${field.name}"
              placeholder="${escapeHtml(field.placeholder || '')}"
              ${field.validation?.min !== undefined ? `min="${field.validation.min}"` : ''}
              ${field.validation?.max !== undefined ? `max="${field.validation.max}"` : ''}
              ${required}>
          </div>
        `;

      case 'date':
        return `
          <div class="form-group">
            <label for="field_${field.name}">${escapeHtml(field.label)} ${requiredMark}</label>
            <input type="date" id="field_${field.name}" name="${field.name}" ${required}>
          </div>
        `;

      case 'select':
        const options = (field.options || []).map(opt =>
          `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`
        ).join('');
        return `
          <div class="form-group">
            <label for="field_${field.name}">${escapeHtml(field.label)} ${requiredMark}</label>
            <select id="field_${field.name}" name="${field.name}" ${required}>
              <option value="">選択してください</option>
              ${options}
            </select>
          </div>
        `;

      case 'textarea':
        return `
          <div class="form-group">
            <label for="field_${field.name}">${escapeHtml(field.label)} ${requiredMark}</label>
            <textarea id="field_${field.name}" name="${field.name}" rows="3"
              placeholder="${escapeHtml(field.placeholder || '')}"
              ${field.validation?.max ? `maxlength="${field.validation.max}"` : ''}
              ${required}></textarea>
          </div>
        `;

      case 'checkbox':
        return `
          <div class="form-group">
            <label style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" id="field_${field.name}" name="${field.name}">
              ${escapeHtml(field.label)}
            </label>
          </div>
        `;

      default:
        return '';
    }
  }).join('');
}

// Collect form data from dynamic fields
function collectFormData() {
  if (!currentFormSchema || !currentFormSchema.fields) {
    return {};
  }

  const data = {};
  currentFormSchema.fields.forEach(field => {
    const element = document.getElementById(`field_${field.name}`);
    if (!element) return;

    switch (field.type) {
      case 'checkbox':
        data[field.name] = element.checked;
        break;
      case 'number':
        data[field.name] = element.value ? Number(element.value) : null;
        break;
      default:
        data[field.name] = element.value || null;
    }
  });

  return data;
}

async function createRequest(event) {
  event.preventDefault();

  const form = event.target;
  const submitButton = event.submitter;
  const action = submitButton.value;

  const workflowId = document.getElementById('workflowSelect').value;
  const title = document.getElementById('requestTitle').value;

  if (!workflowId || !title) {
    alert('ワークフローと件名は必須です');
    return;
  }

  // Collect dynamic form data
  const formData = collectFormData();

  try {
    // Create request
    const createRes = await fetch(`${API_BASE}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId,
        applicantId: currentUser.id,
        applicantOrganizationId: currentUser.organizationId || 'SALES1-1',
        title,
        content: formData
      })
    });

    if (!createRes.ok) {
      const err = await createRes.json();
      throw new Error(err.error || '申請の作成に失敗しました');
    }

    const createData = await createRes.json();
    const requestId = createData.request.id;

    // Submit if requested
    if (action === 'submit') {
      const submitRes = await fetch(`${API_BASE}/requests/${requestId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approverId: currentUser.id })
      });

      if (!submitRes.ok) {
        const err = await submitRes.json();
        throw new Error(err.error || '申請の提出に失敗しました');
      }

      alert('申請を提出しました');
    } else {
      alert('下書きを保存しました');
    }

    closeModal('newRequestModal');
    loadRequests();
  } catch (err) {
    alert(err.message);
  }
}

async function submitRequest(requestId) {
  if (!currentUser) {
    alert('ユーザーを選択してください');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/requests/${requestId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approverId: currentUser.id })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '申請の提出に失敗しました');
    }

    alert('申請を提出しました');
    loadRequests();
  } catch (err) {
    alert(err.message);
  }
}

// Approval actions
function showApprovalAction(requestId, action) {
  document.getElementById('actionRequestId').value = requestId;
  document.getElementById('actionType').value = action;
  document.getElementById('actionComment').value = '';

  const titles = {
    approve: '承認',
    reject: '却下',
    remand: '差戻し'
  };

  document.getElementById('approvalActionTitle').textContent = titles[action];
  document.getElementById('actionSubmitBtn').textContent = titles[action];
  document.getElementById('actionSubmitBtn').className = `btn btn-${action === 'approve' ? 'success' : action === 'reject' ? 'danger' : 'warning'}`;

  showModal('approvalActionModal');
}

async function submitApprovalAction(event) {
  event.preventDefault();

  if (!currentUser) {
    alert('ユーザーを選択してください');
    return;
  }

  const requestId = document.getElementById('actionRequestId').value;
  const action = document.getElementById('actionType').value;
  const comment = document.getElementById('actionComment').value;

  try {
    const res = await fetch(`${API_BASE}/requests/${requestId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approverId: currentUser.id,
        comment: comment || null
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `${action}に失敗しました`);
    }

    const actionLabels = {
      approve: '承認しました',
      reject: '却下しました',
      remand: '差し戻しました'
    };

    alert(actionLabels[action]);
    closeModal('approvalActionModal');
    loadRequests();
    loadApprovals();
  } catch (err) {
    alert(err.message);
  }
}

// Modal helpers
function showModal(id) {
  document.getElementById(id).classList.add('show');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

// Utility functions
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getStatusLabel(status) {
  const labels = {
    draft: '下書き',
    pending: '承認待ち',
    approved: '承認完了',
    rejected: '却下',
    remanded: '差戻し',
    cancelled: '取消し'
  };
  return labels[status] || status;
}

function getStepStatusLabel(status) {
  const labels = {
    pending: '承認待ち',
    approved: '承認済み',
    rejected: '却下',
    skipped: 'スキップ',
    waiting: '待機中'
  };
  return labels[status] || status;
}

function getSkipReasonLabel(reason) {
  const labels = {
    vacant: '空席のためスキップ',
    same_person: '同一人物のためスキップ',
    not_required: '条件不該当のためスキップ'
  };
  return labels[reason] || reason;
}

function getStepTypeLabel(type) {
  const labels = {
    position: '役職による承認',
    role: '承認ロールによる承認',
    specific: '特定ユーザーによる承認'
  };
  return labels[type] || type;
}

function getActionLabel(action) {
  const labels = {
    approve: '承認',
    reject: '却下',
    remand: '差戻し',
    skip: 'スキップ'
  };
  return labels[action] || action;
}

function getActionIcon(action) {
  const icons = {
    approve: '✓',
    reject: '✗',
    remand: '↩',
    skip: '⏭'
  };
  return icons[action] || '•';
}
