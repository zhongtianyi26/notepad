/* api.js — 后端同步层
   ============================================================ */

import { state, save, getActiveProject, setActiveProjectId, expandedSet } from './state.js';
import { render } from './render.js';
import { API_BASE, TOKEN_KEY } from './config.js';

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

/** 封装 fetch，后端不通时静默返回 null；自动附带 token */
export async function backendFetch(path, opts = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(API_BASE + path, { headers, ...opts });
    if (res.status === 401) { if (onUnauthorized) onUnauthorized(); return null; }
    if (!res.ok) { console.warn('[api]', res.status, path); return null; }
    if (res.status === 204) return true;
    return await res.json();
  } catch (e) { console.warn('[api] unreachable:', e.message); return null; }
}

/** 启动时从后端拉取项目列表 */
export async function syncFromBackend() {
  const projects = await backendFetch('/projects');
  if (!projects || !projects.length) return;
  if (state.projects.length) {
    for (const p of projects) {
      if (!state.projects.find(lp => lp.id === p.id)) {
        const full = await backendFetch(`/projects/${p.id}`);
        if (full && full.columns) state.projects.push(full);
      }
    }
  } else {
    for (const p of projects) {
      const full = await backendFetch(`/projects/${p.id}`);
      if (full) state.projects.push(full);
    }
    if (state.projects.length) {
      setActiveProjectId(state.projects[0].id);
      expandedSet.add(state.projects[0].id);
    }
  }
  save(); render();
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
      documents: project.documents.map(d => ({ ...d, tags: JSON.stringify(d.tags || []) })),
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
