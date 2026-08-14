/* dialogs.js — 弹窗与文档视图：任务/列/项目/文档 的 CRUD 表单
   ============================================================ */

import {
  state, activeProjectId, currentDocProjectId, expandedSet,
  PRIORITY,
  uid, save, getActiveProject, findColumn, findCard, setActiveProjectId, setCurrentDocProjectId,
} from './state.js';
import { backendFetch, deleteFromBackend } from './api.js';
import { render, renderProjects, renderBoard, showBoard, showDocView } from './render.js';
import { openDoc, closeDoc, applyTaskLinkToSelection } from './editor.js';

// —— 获取器 ——
const $ = id => document.getElementById(id);

// 打开编辑界面时的 version 快照（乐观锁：保存时带快照版本，编辑期间他人改动才会触发 409）
let _cardVersion = 0, _colVersion = 0, _projVersion = 0;
// 是否从正文「选中文字 → 创建任务」进入（新建任务后回写任务链接 mark）
let _fromSelection = false;
// 元数据自动同步的 debounce 计时器
let _metaSyncTimer = null;


/* ============================================================
 *  任务卡片弹窗
 * ============================================================ */
export function openCardModal(cardId, colId) {
  const project = getActiveProject();
  if (!project) { openProjModal(null); return; }
  const fCol = $('fColumn');
  fCol.innerHTML = project.columns
    .map(c => `<option value="${c.id}">选择列：${c.name}</option>`).join('<option disabled>────────</option>');

  if (cardId) {
    const found = findCard(project, cardId);
    if (!found) return;
    _cardVersion = found.card.version;
    $('modalTitle').textContent = '编辑任务';
    $('cardId').value = found.card.id;
    $('cardColumn').value = found.column.id;
    $('fTitle').value = found.card.title;
    $('fDesc').value = found.card.desc || '';
    $('fAssignee').value = found.card.assignee || '';
    $('fDue').value = found.card.due || '';
    $('fPriority').value = found.card.priority;
    $('fTags').value = (found.card.tags || []).join(', ');
    fCol.value = found.column.id;
    $('deleteCardBtn').classList.remove('hidden');
  } else {
    $('modalTitle').textContent = '新建任务';
    cardForm.reset();
    $('cardId').value = '';
    $('cardColumn').value = colId || project.columns[0]?.id || '';
    $('fPriority').value = 'medium';
    fCol.value = colId || project.columns[0]?.id || '';
    $('deleteCardBtn').classList.add('hidden');
  }
  $('modal').classList.remove('hidden');
  $('fTitle').focus();
}

export function closeCardModal() { $('modal').classList.add('hidden'); }

/** 从正文选中文字创建任务：打开新建任务弹窗，标题预填选中文字 */
export function openCardModalFromText(text) {
  const project = getActiveProject();
  if (!project) return;
  _fromSelection = true;
  openCardModal(null, project.columns[0]?.id);
  $('fTitle').value = text || '';
}

export function initCardForm() {
  // fColumn 下拉变更时同步到 cardColumn（新建任务时用户选择的列）
  $('fColumn').addEventListener('change', () => {
    $('cardColumn').value = $('fColumn').value;
  });

  $('cardForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const project = getActiveProject();
    if (!project) return;
    const cardId = $('cardId').value;
    const colId = $('cardColumn').value || $('fColumn').value;
    const targetCol = findColumn(project, colId);
    if (!targetCol) return;
    const data = {
      title: $('fTitle').value.trim(),
      desc: $('fDesc').value.trim(),
      assignee: $('fAssignee').value.trim(),
      due: $('fDue').value,
      priority: $('fPriority').value,
      tags: $('fTags').value.split(',').map(s => s.trim()).filter(Boolean),
    };
    if (cardId) {
      const found = findCard(project, cardId);
      if (!found) return;
      Object.assign(found.card, data);
      // 跨列移动
      if (found.column.id !== targetCol.id) {
        found.column.cards = found.column.cards.filter(c => c.id !== cardId);
        targetCol.cards.push(found.card);
      }
      const updated = await backendFetch(`/cards/${cardId}`, { method: 'PUT', body: JSON.stringify({ ...data, column_id: targetCol.id, tags: JSON.stringify(data.tags), version: _cardVersion }) });
      if (updated) found.card.version = updated.version;
    } else {
      const id = uid();
      targetCol.cards.push({ id, ...data, column_id: targetCol.id });
      await backendFetch(`/columns/${targetCol.id}/cards`, { method: 'POST', body: JSON.stringify({ id, ...data, tags: JSON.stringify(data.tags) }) });
      // 若从正文选中创建：给选中文字打任务链接 mark（正文走 Yjs 自动同步，无需额外保存）
      if (_fromSelection) {
        applyTaskLinkToSelection(id);
        _fromSelection = false;
      }
    }
    save(); closeCardModal(); renderBoard();
  });

  $('deleteCardBtn').onclick = async () => {
    const project = getActiveProject();
    const cardId = $('cardId').value;
    if (!project || !cardId) return;
    const found = findCard(project, cardId);
    if (!found) return;
    if (confirm('确定删除该任务？')) {
      found.column.cards = found.column.cards.filter(c => c.id !== cardId);
      await backendFetch(`/cards/${cardId}`, { method: 'DELETE' });
      save(); closeCardModal(); renderBoard();
    }
  };
}


/* ============================================================
 *  看板列弹窗
 * ============================================================ */
export function openColModal(colId) {
  const project = getActiveProject();
  if (!project) { openProjModal(null); return; }
  if (colId) {
    const c = findColumn(project, colId);
    _colVersion = c.version;
    $('colModalTitle').textContent = '编辑列';
    $('colId').value = c.id;
    $('colName').value = c.name;
    $('deleteColBtn').classList.remove('hidden');
  } else {
    $('colModalTitle').textContent = '新建列';
    colForm.reset();
    $('colId').value = '';
    $('deleteColBtn').classList.add('hidden');
  }
  $('colModal').classList.remove('hidden');
  $('colName').focus();
}

export function closeColModal() { $('colModal').classList.add('hidden'); }

export function initColForm() {
  $('colForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const project = getActiveProject();
    if (!project) return;
    const colId = $('colId').value;
    const name = $('colName').value.trim();
    if (colId) {
      const col = findColumn(project, colId);
      col.name = name;
      const updated = await backendFetch(`/columns/${colId}`, { method: 'PUT', body: JSON.stringify({ name, version: _colVersion }) });
      if (updated) col.version = updated.version;
    } else {
      const id = uid();
      project.columns.push({ id, name, cards: [] });
      await backendFetch(`/projects/${project.id}/columns`, { method: 'POST', body: JSON.stringify({ id, name, position: project.columns.length - 1 }) });
    }
    save(); closeColModal(); renderBoard();
  });

  $('deleteColBtn').onclick = () => {
    const colId = $('colId').value;
    deleteColumn(colId);
    closeColModal();
  };
}


/* ============================================================
 *  删除列
 * ============================================================ */
export async function deleteColumn(colId) {
  const project = getActiveProject();
  if (project.columns.length <= 1) { alert('至少保留一列'); return; }
  const col = findColumn(project, colId);
  if (!col) return;
  const itemCount = col.cards.length;
  if (itemCount && !confirm(`该列有 ${itemCount} 个任务，删除后一并丢失，确定？`)) return;
  project.columns = project.columns.filter(c => c.id !== colId);
  await backendFetch(`/columns/${colId}`, { method: 'DELETE' });
  save(); render();
}


/* ============================================================
 *  文档全页编辑：正文走 Yjs 自动保存，元数据变更即存（last-write-wins）
 * ============================================================ */
export function openDocView(docId, projId) {
  const pid = projId || activeProjectId;
  const project = state.projects.find(p => p.id === pid);
  if (!project) { openProjModal(null); return; }
  setCurrentDocProjectId(pid);
  expandedSet.add(pid);
  if (pid !== activeProjectId) { setActiveProjectId(pid); renderProjects(); }

  showDocView();   // 先显示视图，确保编辑器在可见容器上初始化

  let targetId;
  if (docId) {
    targetId = docId;
    const d = project.documents.find(x => x.id === docId);
    if (d) {
      $('docTitle').value = d.title || '';
      $('docTags').value = (d.tags || []).join(', ');
      $('docPriority').value = d.priority || 'medium';
      $('docAssignee').value = d.assignee || '';
      $('docDue').value = d.due || '';
    }
  } else {
    // 新建：先在后端创建记录（默认元数据），再打开编辑器
    targetId = uid();
    const defaults = { id: targetId, title: '未命名文档', tags: [], priority: 'medium', due: '', assignee: '' };
    project.documents.push(defaults);
    backendFetch(`/projects/${pid}/documents`, { method: 'POST', body: JSON.stringify({ ...defaults, tags: '[]' }) });
    $('docTitle').value = '';
    $('docTags').value = '';
    $('docPriority').value = 'medium';
    $('docAssignee').value = '';
    $('docDue').value = '';
  }
  $('docId').value = targetId;
  openDoc(targetId, '');
  renderProjects();
}

export function closeDocView() {
  clearTimeout(_metaSyncTimer);
  syncMeta();   // 立即同步元数据，避免 debounce 未触发就关闭导致丢失
  closeDoc();
  setCurrentDocProjectId(null);
  showBoard();
  render();
}

/** 读取元数据表单 */
function readMetaForm() {
  return {
    title: $('docTitle').value.trim() || '未命名文档',
    tags: $('docTags').value.split(',').map(s => s.trim()).filter(Boolean),
    priority: $('docPriority').value,
    due: $('docDue').value,
    assignee: $('docAssignee').value.trim(),
  };
}

/** 立即同步元数据到后端（last-write-wins，无乐观锁） */
function syncMeta() {
  const project = state.projects.find(p => p.id === currentDocProjectId);
  if (!project) return;
  const id = $('docId').value;
  if (!id) return;
  const d = project.documents.find(x => x.id === id);
  if (!d) return;
  const data = readMetaForm();
  Object.assign(d, data);
  backendFetch(`/documents/${id}`, { method: 'PUT', body: JSON.stringify({ ...data, tags: JSON.stringify(data.tags) }) });
  renderProjects();
}

/** 元数据变更即存：debounce 减少请求频率 */
function scheduleMetaSync() {
  clearTimeout(_metaSyncTimer);
  _metaSyncTimer = setTimeout(syncMeta, 500);
}

export function initDocForm() {
  $('docBackBtn').onclick = () => closeDocView();
  // 元数据字段变更即存
  ['docTitle', 'docTags', 'docPriority', 'docAssignee', 'docDue'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', scheduleMetaSync);
  });
  $('docDeleteBtn').onclick = async () => {
    const project = state.projects.find(p => p.id === currentDocProjectId);
    if (!project) return;
    const id = $('docId').value;
    if (!confirm('确定删除该文档？')) return;
    project.documents = project.documents.filter(d => d.id !== id);
    await backendFetch(`/documents/${id}`, { method: 'DELETE' });
    closeDocView();
  };
}


/* ============================================================
 *  项目弹窗
 * ============================================================ */
export function openProjModal(projId) {
  if (projId) {
    const p = state.projects.find(x => x.id === projId);
    _projVersion = p.version;
    $('projModalTitle').textContent = '编辑项目';
    $('projId').value = p.id;
    $('projName').value = p.name;
  } else {
    $('projModalTitle').textContent = '新建项目';
    $('projForm').reset();
    $('projId').value = '';
  }
  $('projModal').classList.remove('hidden');
  $('projName').focus();
}

export function closeProjModal() { $('projModal').classList.add('hidden'); }

export function initProjForm() {
  $('projForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('projId').value;
    const name = $('projName').value.trim();
    if (id) {
      const p = state.projects.find(x => x.id === id);
      p.name = name;
      const updated = await backendFetch(`/projects/${id}`, { method: 'PUT', body: JSON.stringify({ name, version: _projVersion }) });
      if (updated) p.version = updated.version;
    } else {
      const pid = uid();
      const cols = [
        { id: uid(), name: '待办', position: 0 },
        { id: uid(), name: '进行中', position: 1 },
        { id: uid(), name: '已完成', position: 2 },
      ];
      const p = { id: pid, name, columns: cols.map(c => ({ ...c, cards: [] })), documents: [] };
      state.projects.push(p);
      setActiveProjectId(pid);
      expandedSet.add(pid);
      await backendFetch('/projects', {
        method: 'POST',
        body: JSON.stringify({ id: pid, name, columns: cols, documents: [] }),
      });
    }
    save(); closeProjModal(); render();
  });
}


/* ============================================================
 *  删除项目（顶栏按钮）
 * ============================================================ */
export function initDeleteProjectBtn() {
  $('deleteProjectBtn').onclick = async () => {
    const project = getActiveProject();
    if (!project) return;
    if (!confirm(`确定删除项目「${project.name}」及其所有任务与文档？此操作不可恢复。`)) return;
    const delId = project.id;
    state.projects = state.projects.filter(p => p.id !== delId);
    if (state.projects.length === 0) {
      setActiveProjectId(null);
    } else {
      setActiveProjectId(state.projects[0].id);
      expandedSet.add(state.projects[0].id);
    }
    save(); render();
    await deleteFromBackend(delId);
  };
}
