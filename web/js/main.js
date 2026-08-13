/* main.js — 入口：事件绑定、键盘控制、鉴权、启动
   ============================================================ */

import { render, renderBoard } from './render.js';
import {
  openCardModal, closeCardModal, initCardForm,
  openColModal, closeColModal, initColForm,
  openDocView, closeDocView, initDocForm,
  openProjModal, closeProjModal, initProjForm,
  initDeleteProjectBtn,
} from './dialogs.js';
import { syncFromBackend, backendFetch, setUnauthorizedHandler } from './api.js';
import { getActiveProject, setSearchTerm } from './state.js';
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

initAuth(() => {
  // 登录/注册成功
  hideAuth();
  syncFromBackend();
});

async function bootstrap() {
  const user = getUser();
  if (!user) { showAuth('login'); return; }
  $('currentUser').textContent = `👤 ${user.username}`;
  const me = await backendFetch('/auth/me');
  if (me) {
    hideAuth();
    syncFromBackend();
  }
  // me 为 null 时，401 handler 已显示登录页
}

/* —— 启动 —— */
render();
bootstrap();
