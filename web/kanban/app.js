/* ============================================================
 * 项目进度看板 — 逻辑层
 * 数据存于 localStorage，结构：
 *   { projects: [ { id, name, columns:[{id,name,cards:[...]}], documents:[{id,title,intro,status}] } ] }
 * - cards 为「任务」，documents 为「文档」；两者都按所属列（status=列id）汇总到总结看板。
 * ============================================================ */

const STORAGE_KEY = 'kanban.v2';
const PRIORITY = {
  high:   { label: '高', cls: 'high' },
  medium: { label: '中', cls: 'medium' },
  low:    { label: '低', cls: 'low' },
};
const COLUMN_COLORS = ['#4c6ef5', '#f08c00', '#7048e8', '#2f9e44', '#e8590c', '#1098ad'];

/* ---------- 状态 ---------- */
let state = load();
let activeProjectId = state.projects[0]?.id || null;
let searchTerm = '';

/* ---------- 工具 ---------- */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// 首次打开：返回空看板，不预置任何示例项目/数据；用户自行创建。
function emptyState() { return { projects: [] }; }

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { console.warn('读取本地数据失败', e); }
  return emptyState();
}

function normalize(s) {
  if (!s || !Array.isArray(s.projects)) return emptyState();
  s.projects.forEach(p => {
    if (!Array.isArray(p.columns)) p.columns = [];
    if (!Array.isArray(p.documents)) p.documents = [];
    p.columns.forEach(c => { if (!Array.isArray(c.cards)) c.cards = []; });
  });
  return s;
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { console.warn('保存失败', e); }
}

function getActiveProject() {
  return state.projects.find(p => p.id === activeProjectId) || state.projects[0];
}
function findColumn(project, colId) { return project.columns.find(c => c.id === colId); }
function findCard(project, cardId) {
  for (const col of project.columns) {
    const c = col.cards.find(x => x.id === cardId);
    if (c) return { card: c, column: col };
  }
  return null;
}

/* ============================================================
 * 渲染
 * ============================================================ */
function render() {
  renderProjects();
  if (!getActiveProject()) { renderEmpty(); return; }
  renderBoard();
}

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

function renderProjects() {
  const ul = document.getElementById('projectList');
  ul.innerHTML = '';
  state.projects.forEach(p => {
    const total = p.columns.reduce((s, c) => s + c.cards.length, 0) + p.documents.length;
    const li = document.createElement('li');
    li.className = p.id === activeProjectId ? 'active' : '';
    li.innerHTML = `<span class="pname">${escapeHtml(p.name)}</span><span class="pcount">${total}</span>`;
    li.onclick = () => { activeProjectId = p.id; render(); };
    ul.appendChild(li);
  });
}

function renderBoard() {
  const project = getActiveProject();
  const board = document.getElementById('board');
  document.getElementById('boardTitle').textContent = project.name;
  board.innerHTML = '';

  // 文档按 status(列id) 分组，汇总到看板
  const docsByCol = {};
  project.documents.forEach(d => { (docsByCol[d.status] || (docsByCol[d.status] = [])).push(d); });

  // 进度统计：最后一列视为“完成”，任务与文档一并计入
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
  const matchTask = (c) => !term || c.title.toLowerCase().includes(term) ||
    (c.desc || '').toLowerCase().includes(term) ||
    (c.assignee || '').toLowerCase().includes(term) ||
    (c.tags || []).join(',').toLowerCase().includes(term);
  const matchDoc = (d) => !term || d.title.toLowerCase().includes(term) ||
    (d.intro || '').toLowerCase().includes(term);

  project.columns.forEach((col, idx) => {
    const colEl = document.createElement('div');
    colEl.className = 'column';
    colEl.dataset.colId = col.id;

    const head = document.createElement('div');
    head.className = 'column-head';
    const color = COLUMN_COLORS[idx % COLUMN_COLORS.length];
    head.innerHTML = `
      <div class="column-title" data-col="${col.id}">
        <span class="dot" style="background:${color}"></span>${escapeHtml(col.name)}
      </div>
      <div class="column-actions">
        <button class="icon-btn" data-act="edit-col" data-col="${col.id}" title="编辑列">✎</button>
        <button class="icon-btn" data-act="del-col" data-col="${col.id}" title="删除列">🗑</button>
      </div>
      <span class="column-count">${col.cards.length + (docsByCol[col.id] || []).length}</span>`;
    colEl.appendChild(head);

    const body = document.createElement('div');
    body.className = 'column-body';
    body.dataset.colId = col.id;

    const visTasks = col.cards.filter(matchTask);
    const visDocs = (docsByCol[col.id] || []).filter(matchDoc);

    if (visTasks.length === 0 && visDocs.length === 0 && !term) {
      body.innerHTML = `<div class="empty-hint">暂无事项</div>`;
    } else {
      visTasks.forEach(card => body.appendChild(buildCard(card, col.id)));
      visDocs.forEach(doc => body.appendChild(buildDocCard(doc)));
    }
    colEl.appendChild(body);

    const addBtn = document.createElement('div');
    addBtn.className = 'col-add';
    addBtn.textContent = '＋ 添加任务';
    addBtn.onclick = () => openCardModal(null, col.id);
    colEl.appendChild(addBtn);

    bindDropZone(colEl, col.id);
    colEl.querySelector('.column-title').onclick = () => openColModal(col.id);
    colEl.querySelector('[data-act="edit-col"]').onclick = () => openColModal(col.id);
    colEl.querySelector('[data-act="del-col"]').onclick = () => deleteColumn(col.id);

    board.appendChild(colEl);
  });

  const addCol = document.createElement('div');
  addCol.className = 'add-column';
  addCol.innerHTML = `<button title="新建列">＋</button>`;
  addCol.querySelector('button').onclick = () => openColModal(null);
  board.appendChild(addCol);
}

function buildCard(card, colId) {
  const el = document.createElement('div');
  el.className = `card p-${card.priority}`;
  el.draggable = true;
  el.dataset.cardId = card.id;
  el.dataset.kind = 'task';

  const due = card.due ? formatDue(card.due) : null;
  const tags = (card.tags || []).filter(Boolean)
    .map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  const initials = card.assignee ? card.assignee.slice(0, 1) : '?';

  el.innerHTML = `
    <div class="card-title">${escapeHtml(card.title)}</div>
    ${card.desc ? `<div class="card-desc">${escapeHtml(card.desc)}</div>` : ''}
    ${tags ? `<div class="card-tags">${tags}</div>` : ''}
    <div class="card-foot">
      <span class="priority-badge ${PRIORITY[card.priority].cls}">${PRIORITY[card.priority].label}</span>
      <span class="assignee"><span class="avatar">${escapeHtml(initials)}</span>${escapeHtml(card.assignee || '未分配')}</span>
      ${due ? `<span class="due ${due.over ? 'over' : ''}">📅 ${due.text}</span>` : ''}
    </div>`;

  el.onclick = () => openCardModal(card.id, colId);
  bindDrag(el, card.id, 'task');
  return el;
}

function buildDocCard(doc) {
  const el = document.createElement('div');
  el.className = 'card doc';
  el.draggable = true;
  el.dataset.cardId = doc.id;
  el.dataset.kind = 'doc';
  const intro = doc.intro ? `<div class="card-intro">${escapeHtml(doc.intro)}</div>` : '';
  el.innerHTML = `
    <div class="doc-badge">📄 文档</div>
    <div class="card-title">${escapeHtml(doc.title)}</div>
    ${intro}`;
  el.onclick = () => openDocModal(doc.id);
  bindDrag(el, doc.id, 'doc');
  return el;
}

function formatDue(dateStr) {
  const today = new Date().toISOString().slice(0, 10);
  const over = dateStr < today;
  return { text: dateStr.slice(5), over };
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ============================================================
 * 拖拽
 * ============================================================ */
function bindDrag(el, id, kind) {
  el.addEventListener('dragstart', (e) => {
    el.classList.add('dragging');
    e.dataTransfer.setData('text/plain', kind + ':' + id);
    e.dataTransfer.effectAllowed = 'move';
  });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));
}

function bindDropZone(colEl, colId) {
  colEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    colEl.classList.add('drag-over');
  });
  colEl.addEventListener('dragleave', (e) => {
    if (!colEl.contains(e.relatedTarget)) colEl.classList.remove('drag-over');
  });
  colEl.addEventListener('drop', (e) => {
    e.preventDefault();
    colEl.classList.remove('drag-over');
    const data = e.dataTransfer.getData('text/plain');
    const sep = data.indexOf(':');
    const kind = data.slice(0, sep), id = data.slice(sep + 1);
    if (kind === 'doc') moveDoc(id, colId); else moveCard(id, colId);
  });
}

function moveCard(cardId, targetColId) {
  const project = getActiveProject();
  const found = findCard(project, cardId);
  if (!found || found.column.id === targetColId) return;
  found.column.cards = found.column.cards.filter(c => c.id !== cardId);
  findColumn(project, targetColId).cards.push(found.card);
  save();
  render();
}

function moveDoc(docId, targetColId) {
  const project = getActiveProject();
  const doc = project.documents.find(d => d.id === docId);
  if (!doc || doc.status === targetColId) return;
  doc.status = targetColId;   // 状态变更 → 自动同步到对应看板列
  save();
  render();
}

/* ============================================================
 * 任务弹窗
 * ============================================================ */
const modal = document.getElementById('modal');
const cardForm = document.getElementById('cardForm');

function openCardModal(cardId, colId) {
  const project = getActiveProject();
  const fCol = document.getElementById('fColumn');
  fCol.innerHTML = project.columns
    .map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

  if (cardId) {
    const found = findCard(project, cardId);
    const c = found.card;
    document.getElementById('modalTitle').textContent = '编辑任务';
    document.getElementById('cardId').value = c.id;
    document.getElementById('cardColumn').value = found.column.id;
    document.getElementById('fTitle').value = c.title;
    document.getElementById('fDesc').value = c.desc || '';
    document.getElementById('fAssignee').value = c.assignee || '';
    document.getElementById('fDue').value = c.due || '';
    document.getElementById('fPriority').value = c.priority;
    document.getElementById('fTags').value = (c.tags || []).join(', ');
    fCol.value = found.column.id;
    document.getElementById('deleteCardBtn').classList.remove('hidden');
  } else {
    document.getElementById('modalTitle').textContent = '新建任务';
    cardForm.reset();
    document.getElementById('cardId').value = '';
    document.getElementById('cardColumn').value = colId;
    fCol.value = colId;
    document.getElementById('fPriority').value = 'medium';
    document.getElementById('deleteCardBtn').classList.add('hidden');
  }
  modal.classList.remove('hidden');
  document.getElementById('fTitle').focus();
}

function closeCardModal() { modal.classList.add('hidden'); }

cardForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const project = getActiveProject();
  const id = document.getElementById('cardId').value;
  const data = {
    title: document.getElementById('fTitle').value.trim(),
    desc: document.getElementById('fDesc').value.trim(),
    assignee: document.getElementById('fAssignee').value.trim(),
    due: document.getElementById('fDue').value,
    priority: document.getElementById('fPriority').value,
    tags: document.getElementById('fTags').value.split(',').map(s => s.trim()).filter(Boolean),
  };
  const targetColId = document.getElementById('fColumn').value;

  if (id) {
    const found = findCard(project, id);
    Object.assign(found.card, data);
    if (found.column.id !== targetColId) {
      found.column.cards = found.column.cards.filter(c => c.id !== id);
      findColumn(project, targetColId).cards.push(found.card);
    }
  } else {
    const card = { id: uid(), ...data };
    findColumn(project, targetColId).cards.push(card);
  }
  save();
  closeCardModal();
  render();
});

document.getElementById('deleteCardBtn').onclick = () => {
  const id = document.getElementById('cardId').value;
  const project = getActiveProject();
  const found = findCard(project, id);
  if (found && confirm('确定删除该任务？')) {
    found.column.cards = found.column.cards.filter(c => c.id !== id);
    save(); closeCardModal(); render();
  }
};

/* ============================================================
 * 文档弹窗
 * ============================================================ */
const docModal = document.getElementById('docModal');
const docForm = document.getElementById('docForm');

function openDocModal(docId) {
  const project = getActiveProject();
  const fStatus = document.getElementById('docStatus');
  fStatus.innerHTML = project.columns
    .map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

  if (docId) {
    const d = project.documents.find(x => x.id === docId);
    document.getElementById('docModalTitle').textContent = '编辑文档';
    document.getElementById('docId').value = d.id;
    document.getElementById('docTitle').value = d.title;
    document.getElementById('docIntro').value = d.intro || '';
    fStatus.value = d.status;
    document.getElementById('deleteDocBtn').classList.remove('hidden');
  } else {
    document.getElementById('docModalTitle').textContent = '新建文档';
    docForm.reset();
    document.getElementById('docId').value = '';
    fStatus.value = project.columns[0]?.id || '';
    document.getElementById('deleteDocBtn').classList.add('hidden');
  }
  docModal.classList.remove('hidden');
  document.getElementById('docTitle').focus();
}
function closeDocModal() { docModal.classList.add('hidden'); }

docForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const project = getActiveProject();
  const id = document.getElementById('docId').value;
  const data = {
    title: document.getElementById('docTitle').value.trim(),
    intro: document.getElementById('docIntro').value.trim(),
    status: document.getElementById('docStatus').value,
  };
  if (id) {
    const d = project.documents.find(x => x.id === id);
    Object.assign(d, data);   // 状态变更 → 自动同步到看板对应列
  } else {
    project.documents.push({ id: uid(), ...data });
  }
  save();
  closeDocModal();
  render();
});

document.getElementById('deleteDocBtn').onclick = () => {
  const id = document.getElementById('docId').value;
  const project = getActiveProject();
  if (confirm('确定删除该文档？')) {
    project.documents = project.documents.filter(d => d.id !== id);
    save(); closeDocModal(); render();
  }
};

/* ============================================================
 * 列弹窗
 * ============================================================ */
const colModal = document.getElementById('colModal');
const colForm = document.getElementById('colForm');

function openColModal(colId) {
  if (colId) {
    const col = findColumn(getActiveProject(), colId);
    document.getElementById('colModalTitle').textContent = '编辑列';
    document.getElementById('colId').value = col.id;
    document.getElementById('colName').value = col.name;
    document.getElementById('deleteColBtn').classList.remove('hidden');
  } else {
    document.getElementById('colModalTitle').textContent = '新建列';
    colForm.reset();
    document.getElementById('colId').value = '';
    document.getElementById('deleteColBtn').classList.add('hidden');
  }
  colModal.classList.remove('hidden');
  document.getElementById('colName').focus();
}
function closeColModal() { colModal.classList.add('hidden'); }

colForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const project = getActiveProject();
  const id = document.getElementById('colId').value;
  const name = document.getElementById('colName').value.trim();
  if (id) {
    findColumn(project, id).name = name;
  } else {
    project.columns.push({ id: uid(), name, cards: [] });
  }
  save(); closeColModal(); render();
});

document.getElementById('deleteColBtn').onclick = () => {
  const id = document.getElementById('colId').value;
  const project = getActiveProject();
  if (project.columns.length <= 1) { alert('至少保留一列'); return; }
  const col = findColumn(project, id);
  const docCount = project.documents.filter(d => d.status === id).length;
  const itemCount = col.cards.length + docCount;
  if (itemCount && !confirm(`该列有 ${itemCount} 个事项（含 ${docCount} 个文档），删除后一并丢失，确定？`)) return;
  project.columns = project.columns.filter(c => c.id !== id);
  project.documents = project.documents.filter(d => d.status !== id);
  save(); closeColModal(); render();
};

/* ============================================================
 * 项目弹窗
 * ============================================================ */
const projModal = document.getElementById('projModal');
const projForm = document.getElementById('projForm');

function openProjModal(projId) {
  if (projId) {
    const p = state.projects.find(x => x.id === projId);
    document.getElementById('projModalTitle').textContent = '编辑项目';
    document.getElementById('projId').value = p.id;
    document.getElementById('projName').value = p.name;
    document.getElementById('deleteProjBtn').classList.remove('hidden');
  } else {
    document.getElementById('projModalTitle').textContent = '新建项目';
    projForm.reset();
    document.getElementById('projId').value = '';
    document.getElementById('deleteProjBtn').classList.add('hidden');
  }
  projModal.classList.remove('hidden');
  document.getElementById('projName').focus();
}
function closeProjModal() { projModal.classList.add('hidden'); }

projForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('projId').value;
  const name = document.getElementById('projName').value.trim();
  if (id) {
    state.projects.find(x => x.id === id).name = name;
  } else {
    const p = { id: uid(), name, columns: [
      { id: uid(), name: '待办', cards: [] },
      { id: uid(), name: '进行中', cards: [] },
      { id: uid(), name: '已完成', cards: [] },
    ], documents: [] };
    state.projects.push(p);
    activeProjectId = p.id;
  }
  save(); closeProjModal(); render();
});

document.getElementById('deleteProjBtn').onclick = () => {
  const id = document.getElementById('projId').value;
  if (state.projects.length <= 1) { alert('至少保留一个项目'); return; }
  if (!confirm('确定删除该项目及其所有任务与文档？')) return;
  state.projects = state.projects.filter(p => p.id !== id);
  if (activeProjectId === id) activeProjectId = state.projects[0].id;
  save(); closeProjModal(); render();
};

/* ============================================================
 * 事件绑定
 * ============================================================ */
document.getElementById('addCardBtn').onclick = () => {
  const project = getActiveProject();
  if (!project) { openProjModal(null); return; }
  openCardModal(null, project.columns[0]?.id);
};
document.getElementById('addDocBtn').onclick = () => {
  const project = getActiveProject();
  if (!project) { openProjModal(null); return; }
  openDocModal(null);
};
document.getElementById('addProjectBtn').onclick = () => openProjModal(null);
document.getElementById('searchInput').addEventListener('input', (e) => {
  searchTerm = e.target.value; renderBoard();
});

function bindClose(m, closeFn) {
  const x = m.querySelector('.modal-head .icon-btn');
  if (x) x.onclick = closeFn;
  const c = m.querySelector('.modal-cancel');
  if (c) c.onclick = closeFn;
  m.addEventListener('click', (e) => { if (e.target === m) closeFn(); });
}
bindClose(modal, closeCardModal);
bindClose(colModal, closeColModal);
bindClose(projModal, closeProjModal);
bindClose(docModal, closeDocModal);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeCardModal(); closeColModal(); closeProjModal(); closeDocModal(); }
});

/* ---------- 启动 ---------- */
render();
