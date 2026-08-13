/* state.js — 数据层：常量、状态、存取工具、基础函数
   ============================================================ */

export const PRIORITY = {
  high:   { label: '高', cls: 'high' },
  medium: { label: '中', cls: 'medium' },
  low:    { label: '低', cls: 'low' },
};

export const COLUMN_COLORS = ['#4c6ef5', '#f08c00', '#7048e8', '#2f9e44', '#e8590c', '#1098ad'];

// —— 状态 ——
// 后端是唯一数据源，启动时空状态，由 syncFromBackend 拉取填充
export let state = { projects: [] };
export let activeProjectId = state.projects[0]?.id || null;
export let searchTerm = '';
// 侧边栏展开状态
export const expandedSet = new Set();
export let currentDocProjectId = null;


// —— 工具 ——
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function emptyState() { return { projects: [] }; }

/** 规范化后端拉取的数据：补默认值、把 tags 字符串转数组 */
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
      // status 为空 → 无状态文档（只在侧边栏，不进看板列）；非空但列已删 → 也视为无状态
      if (typeof d.status !== 'string') d.status = '';
      if (d.status && !findColumn(p, d.status)) d.status = '';
      if (typeof d.assignee !== 'string') d.assignee = '';
      if (typeof d.due !== 'string') d.due = '';
      if (typeof d.priority !== 'string') d.priority = 'medium';
      if (!Array.isArray(d.tags)) {
        try { d.tags = JSON.parse(d.tags || '[]'); } catch (_) { d.tags = []; }
      }
    });
    // 卡片 tags 同理
    p.columns.forEach(c => c.cards.forEach(card => {
      if (!Array.isArray(card.tags)) {
        try { card.tags = JSON.parse(card.tags || '[]'); } catch (_) { card.tags = []; }
      }
    }));
  });
  return s;
}

/** 已废弃：后端是唯一数据源，无需本地持久化。保留空实现兼容旧调用点。 */
export function save() {}

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
