/* state.js — 数据层：常量、状态、存取工具、基础函数
   ============================================================ */

export const STORAGE_KEY = 'kanban.v2';

export const PRIORITY = {
  high:   { label: '高', cls: 'high' },
  medium: { label: '中', cls: 'medium' },
  low:    { label: '低', cls: 'low' },
};

export const COLUMN_COLORS = ['#4c6ef5', '#f08c00', '#7048e8', '#2f9e44', '#e8590c', '#1098ad'];

// —— 状态 ——
export let state = load();
export let activeProjectId = state.projects[0]?.id || null;
export let searchTerm = '';
// 侧边栏展开状态
export const expandedSet = new Set();
export let currentDocProjectId = null;
if (activeProjectId) expandedSet.add(activeProjectId);


// —— 工具 ——
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function emptyState() { return { projects: [] }; }

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { console.warn('读取本地数据失败', e); }
  return emptyState();
}

export function normalize(s) {
  if (!s || !Array.isArray(s.projects)) return emptyState();
  s.projects.forEach(p => {
    if (!Array.isArray(p.columns)) p.columns = [];
    if (!Array.isArray(p.documents)) p.documents = [];
    p.columns.forEach(c => { if (!Array.isArray(c.cards)) c.cards = []; });
    p.documents.forEach(d => {
      if (typeof d.title !== 'string' || !d.title) d.title = '未命名文档';
      if (typeof d.intro !== 'string') d.intro = '';
      if (typeof d.content !== 'string') d.content = '';
      if (!findColumn(p, d.status)) d.status = p.columns[0]?.id || '';
      if (typeof d.assignee !== 'string') d.assignee = '';
      if (typeof d.due !== 'string') d.due = '';
      if (typeof d.priority !== 'string') d.priority = 'medium';
      if (!Array.isArray(d.tags)) {
        try { d.tags = JSON.parse(d.tags || '[]'); } catch (_) { d.tags = []; }
      }
    });
  });
  return s;
}

export function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { console.warn('保存失败', e); }
}

export function getActiveProject() {
  return state.projects.find(p => p.id === activeProjectId) || state.projects[0];
}

export function findColumn(project, colId) {
  return project.columns.find(c => c.id === colId);
}

export function findCard(project, cardId) {
  for (const col of project.columns) {
    const c = col.cards.find(x => x.id === cardId);
    if (c) return { card: c, column: col };
  }
  return null;
}

export function setActiveProjectId(id) { activeProjectId = id; }
export function setSearchTerm(v) { searchTerm = v; }
export function setCurrentDocProjectId(id) { currentDocProjectId = id; }
export function setState(newState) { Object.assign(state, newState); }

export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
