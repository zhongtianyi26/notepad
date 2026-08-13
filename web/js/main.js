/* main.js — 入口：事件绑定、键盘控制、鉴权、启动
   ============================================================ */

import { render, renderBoard, renderProjects } from './render.js';
import {
  openCardModal, closeCardModal, initCardForm,
  openColModal, closeColModal, initColForm,
  openDocView, closeDocView, initDocForm,
  openProjModal, closeProjModal, initProjForm,
  initDeleteProjectBtn,
} from './dialogs.js';
import { syncFromBackend, backendFetch, setUnauthorizedHandler, setConflictHandler, fetchProject } from './api.js';
import { getActiveProject, setSearchTerm, state, normalize } from './state.js';
import { getUser, clearAuth, initAuth, showAuth, hideAuth } from './auth.js';

const $ = id => document.getElementById(id);

/* —— 表单与按钮初始化 —— */
initCardForm();
initColForm();
initDocForm();
initProjForm();
initDeleteProjectBtn();

/* —— 顶栏按钮 —— */
$('addCardBtn').onclick = () => {
  const project = getActiveProject();
  if (!project) { openProjModal(null); return; }
  openCardModal(null, project.columns[0]?.id);
};
$('addDocBtn').onclick = () => openDocView(null);
$('addProjectBtn').onclick = () => openProjModal(null);
$('searchInput').addEventListener('input', (e) => {
  setSearchTerm(e.target.value);
  renderBoard();
});

/* —— 弹窗关闭绑定 —— */
function bindClose(m, closeFn) {
  const x = m.querySelector('.modal-head .icon-btn');
  if (x) x.onclick = closeFn;
  const c = m.querySelector('.modal-cancel');
  if (c) c.onclick = closeFn;
  m.addEventListener('click', (e) => { if (e.target === m) closeFn(); });
}
bindClose($('modal'), closeCardModal);
bindClose($('colModal'), closeColModal);
bindClose($('projModal'), closeProjModal);

/* —— 键盘 —— */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if ($('docView') && !$('docView').classList.contains('hidden')) {
      $('docBackBtn').click();
    } else {
      closeCardModal(); closeColModal(); closeProjModal();
    }
  }
});

/* —— 鉴权 —— */
setUnauthorizedHandler(() => {
  clearAuth();
  $('currentUser').textContent = '';
  showAuth('login');
});

// 乐观锁冲突：提示并刷新当前项目数据
setConflictHandler(async (detail) => {
  alert(detail || '数据已被他人修改，已刷新为最新内容');
  const p = getActiveProject();
  if (p) {
    const fresh = await fetchProject(p.id);
    if (fresh && fresh.columns) {
      const idx = state.projects.findIndex(x => x.id === p.id);
      if (idx >= 0) state.projects[idx] = normalize({ projects: [fresh] }).projects[0];
      renderBoard();
    }
  }
});

initAuth(() => {
  // 登录/注册成功
  hideAuth();
  syncFromBackend();
  startPolling();
});

async function bootstrap() {
  const user = getUser();
  if (!user) { showAuth('login'); return; }
  $('currentUser').textContent = `👤 ${user.username}`;
  const me = await backendFetch('/auth/me');
  if (me) {
    hideAuth();
    syncFromBackend();
    startPolling();
  }
  // me 为 null 时，401 handler 已显示登录页
}

/* —— 轮询同步：定期拉取当前项目，让多用户互相看到对方改动 —— */
let pollTimer = null;

async function pollProject() {
  // 1. 同步项目列表：把后端有、本地没有的新项目补进来
  const list = await backendFetch('/projects');
  if (list && list.length) {
    for (const item of list) {
      if (!state.projects.find(lp => lp.id === item.id)) {
        const full = await fetchProject(item.id);
        if (full && full.columns) {
          state.projects.push(normalize({ projects: [full] }).projects[0]);
        }
      }
    }
  }
  // 2. 拉当前项目详情，更新数据
  const p = getActiveProject();
  if (p) {
    const fresh = await fetchProject(p.id);
    if (fresh && fresh.columns) {
      const idx = state.projects.findIndex(x => x.id === p.id);
      if (idx >= 0) state.projects[idx] = normalize({ projects: [fresh] }).projects[0];
    }
  }
  renderBoard();
  renderProjects();
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(pollProject, 3000);
}

/* —— 启动 —— */
render();
bootstrap();
