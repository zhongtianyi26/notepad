/* api.js — 后端同步层
   ============================================================ */

import { state, save, getActiveProject, setActiveProjectId, expandedSet, normalize } from './state.js';
import { render } from './render.js';
import { API_BASE, TOKEN_KEY } from './config.js';

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

let onConflict = null;
export function setConflictHandler(fn) { onConflict = fn; }

/** 封装 fetch，后端不通时静默返回 null；自动附带 token */
export async function backendFetch(path, opts = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(API_BASE + path, { headers, ...opts });
    if (res.status === 401) { if (onUnauthorized) onUnauthorized(); return null; }
    if (res.status === 409) {
      const data = await res.json().catch(() => null);
      if (onConflict) onConflict(data?.detail || '数据已被修改');
      return null;
    }
    if (!res.ok) { console.warn('[api]', res.status, path); return null; }
    if (res.status === 204) return true;
    return await res.json();
  } catch (e) { console.warn('[api] unreachable:', e.message); return null; }
}

/** 拉取完整项目数据（列/卡片/文档），用于同步 */
export async function fetchProject(projectId) {
  return backendFetch(`/projects/${projectId}`);
}

/** 建立 SSE 连接订阅全局变更事件，返回 EventSource（由调用方关闭）。
 *  收到 `update` 事件或连接建立/重连成功时回调 onUpdate。
 */
export function connectProjectEvents(onUpdate) {
  const es = new EventSource(`${API_BASE}/events`);
  es.addEventListener('update', onUpdate);
  es.onopen = onUpdate;
  return es;
}

/** 启动时从后端全量拉取项目数据（后端是唯一数据源） */
export async function syncFromBackend() {
  const projects = await backendFetch('/projects');
  if (!projects) return;
  const fulls = [];
  for (const p of projects) {
    const full = await backendFetch(`/projects/${p.id}`);
    if (full && full.columns) fulls.push(full);
  }
  const normalized = normalize({ projects: fulls });
  state.projects = normalized.projects;
  if (state.projects.length) {
    setActiveProjectId(state.projects[0].id);
    expandedSet.add(state.projects[0].id);
  }
  render();
}

/** 将指定项目的完整 state 推送到后端 */
export async function syncToBackend(project) {
  const cards = {};
  project.columns.forEach(c => { cards[c.id] = c.cards.map(card => ({
    ...card, tags: JSON.stringify(card.tags || [])
  })); });
  return backendFetch(`/projects/${project.id}/sync`, {
    method: 'PUT',
    body: JSON.stringify({
      name: project.name,
      columns: project.columns.map(c => ({ id: c.id, name: c.name, position: 0 })),
      documents: project.documents.map(d => ({ id: d.id, title: d.title })),
      cards,
    }),
  });
}

/** 从后端删除项目 */
export async function deleteFromBackend(projectId) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
  try {
    await fetch(`${API_BASE}/projects/${projectId}`, { method: 'DELETE', headers });
  } catch (e) { console.warn('[api] delete unreachable:', e.message); }
}
