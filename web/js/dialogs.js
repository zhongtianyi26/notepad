/* dialogs.js — 弹窗与文档视图：任务/列/项目/文档 的 CRUD 表单
   ============================================================ */

import {
  state, activeProjectId, currentDocProjectId, expandedSet,
  PRIORITY,
  uid, save, getActiveProject, findColumn, findCard, setActiveProjectId, setCurrentDocProjectId,
} from './state.js';
import { backendFetch, deleteFromBackend } from './api.js';
import { render, renderProjects, renderBoard, showBoard, showDocView } from './render.js';

// —— 获取器 ——
const $ = id => document.getElementById(id);


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

export function initCardForm() {
  // fColumn 下拉变更时同步到 cardColumn（新建任务时用户选择的列）
  $('fColumn').addEventListener('change', () => {
    $('cardColumn').value = $('fColumn').value;
  });

  $('cardForm').addEventListener('submit', (e) => {
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
      backendFetch(`/cards/${cardId}`, { method: 'PUT', body: JSON.stringify({ ...data, column_id: targetCol.id, tags: JSON.stringify(data.tags) }) });
    } else {
      const id = uid();
      targetCol.cards.push({ id, ...data, column_id: targetCol.id });
      backendFetch(`/columns/${targetCol.id}/cards`, { method: 'POST', body: JSON.stringify({ id, ...data, tags: JSON.stringify(data.tags) }) });
    }
    save(); closeCardModal(); renderBoard();
  });

  $('deleteCardBtn').onclick = () => {
    const project = getActiveProject();
    const cardId = $('cardId').value;
    if (!project || !cardId) return;
    const found = findCard(project, cardId);
    if (!found) return;
    if (confirm('确定删除该任务？')) {
      found.column.cards = found.column.cards.filter(c => c.id !== cardId);
      backendFetch(`/cards/${cardId}`, { method: 'DELETE' });
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
  $('colForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const project = getActiveProject();
    if (!project) return;
    const colId = $('colId').value;
    const name = $('colName').value.trim();
    if (colId) {
      findColumn(project, colId).name = name;
      backendFetch(`/columns/${colId}`, { method: 'PUT', body: JSON.stringify({ name }) });
    } else {
      const id = uid();
      project.columns.push({ id, name, cards: [] });
      backendFetch(`/projects/${project.id}/columns`, { method: 'POST', body: JSON.stringify({ id, name, position: project.columns.length - 1 }) });
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
export function deleteColumn(colId) {
  const project = getActiveProject();
  if (project.columns.length <= 1) { alert('至少保留一列'); return; }
  const col = findColumn(project, colId);
  if (!col) return;
  const docCount = project.documents.filter(d => d.status === colId).length;
  const itemCount = col.cards.length + docCount;
  if (itemCount && !confirm(`该列有 ${itemCount} 个事项（含 ${docCount} 个文档），删除后一并丢失，确定？`)) return;
  project.columns = project.columns.filter(c => c.id !== colId);
  project.documents = project.documents.filter(d => d.status !== colId);
  backendFetch(`/columns/${colId}`, { method: 'DELETE' });
  save(); render();
}


/* ============================================================
 *  文档全页编辑
 * ============================================================ */
export function openDocView(docId, projId) {
  const pid = projId || activeProjectId;
  const project = state.projects.find(p => p.id === pid);
  if (!project) { openProjModal(null); return; }
  setCurrentDocProjectId(pid);
  expandedSet.add(pid);
  if (pid !== activeProjectId) { setActiveProjectId(pid); renderProjects(); }

  const fStatus = $('docStatus');
  fStatus.innerHTML = project.columns
    .map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  if (docId) {
    const d = project.documents.find(x => x.id === docId);
    $('docId').value = d.id;
    $('docTitle').value = d.title;
    $('docIntro').value = d.intro || '';
    $('docContent').value = d.content || '';
    $('docAssignee').value = d.assignee || '';
    $('docDue').value = d.due || '';
    $('docPriority').value = d.priority || 'medium';
    $('docTags').value = (d.tags || []).join(', ');
    fStatus.value = d.status;
    $('docDeleteBtn').classList.remove('hidden');
  } else {
    $('docId').value = '';
    $('docTitle').value = '';
    $('docIntro').value = '';
    $('docContent').value = '';
    $('docAssignee').value = '';
    $('docDue').value = '';
    $('docPriority').value = 'medium';
    $('docTags').value = '';
    fStatus.value = project.columns[0]?.id || '';
    $('docDeleteBtn').classList.add('hidden');
  }
  showDocView();
  renderProjects();
  $('docTitle').focus();
}

export function closeDocView() {
  setCurrentDocProjectId(null);
  showBoard();
  render();
}

function saveDoc() {
  const project = state.projects.find(p => p.id === currentDocProjectId);
  if (!project) return;
  const id = $('docId').value;
  const data = {
    title: $('docTitle').value.trim() || '未命名文档',
    intro: $('docIntro').value.trim(),
    content: $('docContent').value,
    status: $('docStatus').value,
    assignee: $('docAssignee').value.trim(),
    due: $('docDue').value,
    priority: $('docPriority').value,
    tags: $('docTags').value.split(',').map(s => s.trim()).filter(Boolean),
  };
  if (id) {
    const d = project.documents.find(x => x.id === id);
    Object.assign(d, data);
    backendFetch(`/documents/${id}`, { method: 'PUT', body: JSON.stringify({ ...data, tags: JSON.stringify(data.tags) }) });
  } else {
    const newId = uid();
    project.documents.push({ id: newId, ...data });
    backendFetch(`/projects/${project.id}/documents`, { method: 'POST', body: JSON.stringify({ id: newId, ...data, tags: JSON.stringify(data.tags) }) });
  }
  save();
  closeDocView();
}

export function initDocForm() {
  $('docForm').addEventListener('submit', (e) => { e.preventDefault(); saveDoc(); });
  $('docSaveBtn').onclick = saveDoc;
  $('docBackBtn').onclick = () => {
    const dirty = $('docTitle').value.trim()
      || $('docContent').value.trim()
      || $('docIntro').value.trim();
    if (dirty && !confirm('放弃未保存的更改？')) return;
    closeDocView();
  };
  $('docDeleteBtn').onclick = () => {
    const project = state.projects.find(p => p.id === currentDocProjectId);
    if (!project) return;
    const id = $('docId').value;
    if (!confirm('确定删除该文档？')) return;
    project.documents = project.documents.filter(d => d.id !== id);
    backendFetch(`/documents/${id}`, { method: 'DELETE' });
    save(); closeDocView();
  };
}


/* ============================================================
 *  项目弹窗
 * ============================================================ */
export function openProjModal(projId) {
  if (projId) {
    const p = state.projects.find(x => x.id === projId);
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
  $('projForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = $('projId').value;
    const name = $('projName').value.trim();
    if (id) {
      state.projects.find(x => x.id === id).name = name;
      backendFetch(`/projects/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
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
      backendFetch('/projects', {
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
  $('deleteProjectBtn').onclick = () => {
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
    deleteFromBackend(delId);
  };
}
