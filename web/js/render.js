/* render.js — 渲染层：侧边栏、看板、卡片
   ============================================================ */

import {
  state, activeProjectId, searchTerm, expandedSet, currentDocProjectId,
  PRIORITY, COLUMN_COLORS,
  getActiveProject, findColumn, escapeHtml, uid, setActiveProjectId, setCurrentDocProjectId, save,
} from './state.js';
import { backendFetch } from './api.js';
// 循环依赖安全：以下函数仅在事件回调（onclick）中调用，非 import 时执行
import {
  openCardModal, openDocView, openProjModal, openColModal, deleteColumn,
} from './dialogs.js';


/* —— 视图切换 —— */
export function showBoard() {
  document.getElementById('boardArea').classList.remove('hidden');
  document.getElementById('docView').classList.add('hidden');
}
export function showDocView() {
  document.getElementById('boardArea').classList.add('hidden');
  document.getElementById('docView').classList.remove('hidden');
}


/* —— 顶层 render —— */
export function render() {
  renderProjects();
  if (!getActiveProject()) { renderEmpty(); return; }
  renderBoard();
}


/* —— 空状态 —— */
function renderEmpty() {
  const board = document.getElementById('board');
  document.getElementById('boardTitle').textContent = '项目进度看板';
  document.getElementById('boardMeta').textContent = '';
  document.getElementById('progressFill').style.width = '0%';
  document.getElementById('progressText').textContent = '0 / 0（0%）';
  board.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">📋</div>
      <h2>还没有项目</h2>
      <p>创建你的第一个项目，用看板管理任务与文档进度。</p>
      <button class="btn-primary" id="emptyCreateBtn">＋ 新建项目</button>
    </div>`;
  document.getElementById('emptyCreateBtn').onclick = () => openProjModal(null);
}


/* —— 侧边栏项目列表 —— */
export function renderProjects() {
  const ul = document.getElementById('projectList');
  ul.innerHTML = '';
  state.projects.forEach(p => {
    const total = p.columns.reduce((s, c) => s + c.cards.length, 0) + p.documents.length;
    const expanded = expandedSet.has(p.id);

    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = 'project-row' + (p.id === activeProjectId ? ' active' : '');
    row.innerHTML = `
      <span class="toggle-arrow ${expanded ? '' : 'collapsed'}" data-toggle="${p.id}">▾</span>
      <span class="pname">${escapeHtml(p.name)}</span>
      <span class="pcount">${total}</span>`;
    row.querySelector('[data-toggle]').onclick = (e) => {
      e.stopPropagation();
      if (expandedSet.has(p.id)) expandedSet.delete(p.id); else expandedSet.add(p.id);
      renderProjects();
    };
    // 点击整行任意位置（项目名/计数/空白）都切换项目
    row.onclick = () => selectProject(p.id);
    li.appendChild(row);

    const docUl = document.createElement('ul');
    docUl.className = 'doc-items' + (expanded ? '' : ' hidden');
    if (p.documents.length === 0) {
      docUl.innerHTML = `<li class="doc-empty">暂无文档</li>`;
    } else {
      p.documents.forEach(d => {
        const dli = document.createElement('li');
        dli.dataset.docId = d.id;
        if (currentDocProjectId === p.id && document.getElementById('docId').value === d.id) {
          dli.className = 'active-doc';
        }
        dli.innerHTML = `<span class="doc-ico">📄</span><span class="doc-name">${escapeHtml(d.title || '未命名')}</span>`;
        dli.onclick = () => openDocView(d.id, p.id);
        docUl.appendChild(dli);
      });
    }
    const addLi = document.createElement('li');
    addLi.className = 'doc-add';
    addLi.innerHTML = `<span class="doc-ico">＋</span><span>新建文档</span>`;
    addLi.onclick = () => openDocView(null, p.id);
    docUl.appendChild(addLi);
    li.appendChild(docUl);

    ul.appendChild(li);
  });
}

export function selectProject(id) {
  setActiveProjectId(id);
  setCurrentDocProjectId(null);   // 切项目即退出文档编辑态
  expandedSet.add(id);
  showBoard();
  render();
}


/* —— 看板列 + 进度条 —— */
export function renderBoard() {
  const project = getActiveProject();
  if (!project) return renderEmpty();
  const board = document.getElementById('board');
  document.getElementById('boardTitle').textContent = project.name;
  board.innerHTML = '';

  const docsByCol = {};
  project.documents.forEach(d => { (docsByCol[d.status] || (docsByCol[d.status] = [])).push(d); });

  let total = 0, done = 0;
  project.columns.forEach((col, idx) => {
    const n = col.cards.length + (docsByCol[col.id] || []).length;
    total += n;
    if (idx === project.columns.length - 1) done = n;
  });
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressText').textContent = `${done} / ${total}（${pct}%）`;

  const taskCount = project.columns.reduce((s, c) => s + c.cards.length, 0);
  document.getElementById('boardMeta').textContent =
    `${project.columns.length} 个阶段 · ${taskCount} 个任务 · ${project.documents.length} 个文档`;

  const term = searchTerm.trim().toLowerCase();
  project.columns.forEach((col, idx) => {
    const colEl = document.createElement('div');
    colEl.className = 'kanban-col';
    colEl.dataset.colId = col.id;
    colEl.style.setProperty('--col-color', COLUMN_COLORS[idx % COLUMN_COLORS.length]);
    colEl.innerHTML = `
      <div class="col-head">
        <div class="col-name">${escapeHtml(col.name)}</div>
        <div class="col-count">${col.cards.length + (docsByCol[col.id] || []).length}</div>
        <div class="col-actions">
          <button data-act="edit-col" title="编辑列名">✎</button>
          <button data-act="del-col" title="删除列">🗑</button>
        </div>
      </div>
      <div class="col-body" data-col="${col.id}"></div>`;

    colEl.querySelector('[data-act="edit-col"]').onclick = () => openColModal(col.id);
    colEl.querySelector('[data-act="del-col"]').onclick = () => deleteColumn(col.id);

    const body = colEl.querySelector('.col-body');
    // 放置判定放宽到整个列（含列头与空白），而非仅卡片区
    colEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      colEl.classList.add('drag-over');
    });
    colEl.addEventListener('dragleave', (e) => {
      if (!colEl.contains(e.relatedTarget)) colEl.classList.remove('drag-over');
    });
    colEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      colEl.classList.remove('drag-over');
      const cid = e.dataTransfer.getData('text/plain');
      const kind = e.dataTransfer.getData('kind');
      if (kind === 'task') {
        const srcCol = findColumn(project, e.dataTransfer.getData('from-col'));
        if (!srcCol) return;
        const card = srcCol.cards.find(c => c.id === cid);
        if (card && srcCol.id !== col.id) {
          srcCol.cards = srcCol.cards.filter(c => c.id !== cid);
          col.cards.push(card);
          // 后端：更新卡片所在列（带乐观锁版本号）
          await backendFetch(`/cards/${cid}`, { method: 'PUT', body: JSON.stringify({ column_id: col.id, version: card.version }) });
          save(); renderBoard();
        }
      } else if (kind === 'doc') {
        const doc = project.documents.find(d => d.id === cid);
        if (doc && doc.status !== col.id) {
          doc.status = col.id;
          await backendFetch(`/documents/${cid}`, { method: 'PUT', body: JSON.stringify({ status: col.id, version: doc.version }) });
          save(); renderBoard();
        }
      }
    });

    /* 任务卡片 */
    col.cards.forEach(card => {
      if (term && !matchCard(card, term)) return;
      body.appendChild(buildCard(card, col.id));
    });
    /* 文档卡片 */
    (docsByCol[col.id] || []).forEach(doc => {
      if (term && !matchDoc(doc, term)) return;
      body.appendChild(buildDocCard(doc));
    });

    board.appendChild(colEl);
  });

  /* 新建列按钮 */
  const addCol = document.createElement('div');
  addCol.className = 'add-column';
  addCol.innerHTML = `<button title="新建列">＋</button>`;
  addCol.querySelector('button').onclick = () => openColModal(null);
  board.appendChild(addCol);
}


/* —— 卡片渲染 —— */
function buildCard(card, colId) {
  const el = document.createElement('div');
  el.className = `card p-${card.priority}`;
  el.draggable = true;
  el.dataset.cardId = card.id;
  el.dataset.kind = 'task';
  const pInfo = PRIORITY[card.priority];
  const pBadge = pInfo ? `<span class="priority-badge ${pInfo.cls}">${pInfo.label}</span>` : '';
  const due = card.due ? (() => { const f = formatDue(card.due); return `<span class="due ${f.over ? 'over' : ''}">📅 ${f.text}</span>`; })() : '';
  const assignee = card.assignee ? `<span class="assignee" title="负责人">👤 ${escapeHtml(card.assignee)}</span>` : '';
  const tagEls = (card.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  el.innerHTML = `
    <div class="card-meta">
      ${pBadge}
      ${due}
    </div>
    <div class="card-title">${escapeHtml(card.title)}</div>
    <div class="card-bottom">
      ${assignee}
      <div class="card-tags">${tagEls}</div>
    </div>`;
  el.onclick = () => openCardModal(card.id, colId);
  bindDrag(el, card.id, 'task', colId);
  return el;
}

function buildDocCard(doc) {
  const el = document.createElement('div');
  el.className = `card doc p-${doc.priority || 'medium'}`;
  el.draggable = true;
  el.dataset.cardId = doc.id;
  el.dataset.kind = 'doc';
  const intro = doc.intro ? `<div class="card-intro">${escapeHtml(doc.intro)}</div>` : '';
  const pBadge = PRIORITY[doc.priority]
    ? `<span class="priority-badge ${PRIORITY[doc.priority].cls}">${PRIORITY[doc.priority].label}</span>` : '';
  const due = doc.due ? (() => { const f = formatDue(doc.due); return `<span class="due ${f.over ? 'over' : ''}">📅 ${f.text}</span>`; })() : '';
  const assignee = doc.assignee ? `<span class="assignee" title="负责人">👤 ${escapeHtml(doc.assignee)}</span>` : '';
  const tagEls = (doc.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  el.innerHTML = `
    <div class="card-meta">
      <div class="doc-badge">📄 文档</div>
      ${pBadge}
      ${due}
    </div>
    <div class="card-title">${escapeHtml(doc.title)}</div>
    ${intro}
    <div class="card-bottom">
      ${assignee}
      <div class="card-tags">${tagEls}</div>
    </div>`;
  el.onclick = () => openDocView(doc.id);
  bindDrag(el, doc.id, 'doc');
  return el;
}


/* —— 搜索匹配 —— */
function matchCard(card, term) {
  return card.title.toLowerCase().includes(term)
    || (card.desc || '').toLowerCase().includes(term)
    || (card.assignee || '').toLowerCase().includes(term)
    || (card.tags || []).some(t => t.toLowerCase().includes(term));
}
function matchDoc(doc, term) {
  return (doc.title || '').toLowerCase().includes(term)
    || (doc.intro || '').toLowerCase().includes(term)
    || (doc.assignee || '').toLowerCase().includes(term)
    || (doc.tags || []).some(t => t.toLowerCase().includes(term));
}


/* —— 拖拽绑定 —— */
export function bindDrag(el, id, kind, colId) {
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.setData('kind', kind);
    if (colId) e.dataTransfer.setData('from-col', colId);
    el.style.opacity = '0.5';
  });
  el.addEventListener('dragend', () => { el.style.opacity = '1'; });
}


/* —— 日期格式化 —— */
export function formatDue(dateStr) {
  const today = new Date().toISOString().slice(0, 10);
  const over = dateStr < today;
  return { text: dateStr.slice(5), over };
}
