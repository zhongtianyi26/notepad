/* main.js — 入口：事件绑定、键盘控制、鉴权、启动
   ============================================================ */

import { render, renderBoard, renderProjects, showBoard } from './render.js';
import {
  openCardModal, closeCardModal, initCardForm, openCardModalFromText,
  openColModal, closeColModal, initColForm,
  openDocView, closeDocView, initDocForm,
  openProjModal, closeProjModal, initProjForm,
  initDeleteProjectBtn,
} from './dialogs.js';
import { syncFromBackend, backendFetch, setUnauthorizedHandler, setConflictHandler, fetchProject, connectProjectEvents } from './api.js';
import { getActiveProject, setSearchTerm, state, normalize } from './state.js';
import { getUser, clearAuth, initAuth, showAuth, hideAuth } from './auth.js';
import { setTaskLinkClickHandler, setSelectionCreateHandler, setCollabUser, colorForUser } from './editor.js';

const $ = id => document.getElementById(id);

/* —— 任务链接跳转：点击正文里的任务链接 → 切回看板并打开任务弹窗 —— */
setTaskLinkClickHandler((cardId) => {
  showBoard();
  openCardModal(cardId);
});

/* —— 选中正文文字 → 弹出「创建任务」按钮 → 打开任务弹窗（标题预填） —— */
setSelectionCreateHandler((text) => {
  openCardModalFromText(text);
});

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
  startRealtimeSync();
});

async function bootstrap() {
  const user = getUser();
  if (!user) { showAuth('login'); return; }
  $('currentUser').textContent = `👤 ${user.username}`;
  // 设置协作用户身份（供多人光标显示「谁在编辑」）
  setCollabUser({ name: user.username, color: colorForUser(user.username) });
  const me = await backendFetch('/auth/me');
  if (me) {
    hideAuth();
    syncFromBackend();
    startRealtimeSync();
  }
  // me 为 null 时，401 handler 已显示登录页
}

/* —— 实时同步：SSE 为主，低频轮询兜底 —— */
let pollTimer = null;
let eventSource = null;

async function pollProject() {
  // 1. 同步项目列表：把后端有、本地没有的新项目补进来
  const list = await backendFetch('/projects');
  if (list && list.length) {
    for (const item of list) {
      if (state.projects.find(lp => lp.id === item.id)) continue;
      const full = await fetchProject(item.id);
      // await 期间可能有其他并发调用（如启动时的 syncFromBackend）已推入同一项目，
      // push 前再查一次，避免重复（检查到 push 之间无 await，单线程下原子）
      if (full && full.columns && !state.projects.find(lp => lp.id === item.id)) {
        state.projects.push(normalize({ projects: [full] }).projects[0]);
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

function startRealtimeSync() {
  if (eventSource) return;
  // SSE 实时通知：任一写操作后立即触发刷新
  eventSource = connectProjectEvents(() => pollProject());
  // 低频兜底轮询：EventSource 断连期间防漏（最终一致）
  pollTimer = setInterval(pollProject, 30000);
}

/* —— 启动 —— */
render();
bootstrap();
