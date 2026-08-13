/* auth.js — 用户认证：token 管理、登录/注册/登出
   ============================================================ */

import { API_BASE, TOKEN_KEY, USER_KEY } from './config.js';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); }
  catch (_) { return null; }
}
export function isLoggedIn() { return !!getToken(); }

export function setAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

const $ = id => document.getElementById(id);
let mode = 'login';          // 'login' | 'register'
let onAuthenticated = null;  // 登录成功后回调（由 main.js 注入）


/** 原生 fetch（登录/注册不用自动带 token 的 backendFetch） */
async function authRequest(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.detail || '请求失败');
  return data;
}


export function showAuth(initialMode = 'login') {
  setMode(initialMode);
  $('authOverlay').classList.remove('hidden');
  $('authUsername').focus();
}

export function hideAuth() {
  $('authOverlay').classList.add('hidden');
}

function setMode(m) {
  mode = m;
  const isLogin = m === 'login';
  $('authTitle').textContent = isLogin ? '登录' : '注册';
  $('authSubmit').textContent = isLogin ? '登录' : '注册';
  $('authSwitchText').textContent = isLogin ? '还没有账号？' : '已有账号？';
  $('authSwitchLink').textContent = isLogin ? '去注册' : '去登录';
  $('authPassword').setAttribute('autocomplete', isLogin ? 'current-password' : 'new-password');
  $('authError').classList.add('hidden');
}

function showError(msg) {
  const el = $('authError');
  el.textContent = msg;
  el.classList.remove('hidden');
}


export function initAuth(onAuth) {
  onAuthenticated = onAuth;

  $('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('authUsername').value.trim();
    const password = $('authPassword').value;
    if (!username || !password) { showError('请填写用户名和密码'); return; }
    if (mode === 'register' && password.length < 6) { showError('密码至少 6 位'); return; }

    const path = mode === 'login' ? '/auth/login' : '/auth/register';
    try {
      const data = await authRequest(path, { username, password });
      setAuth(data.access_token, data.user);
      $('currentUser').textContent = `👤 ${data.user.username}`;
      hideAuth();
      $('authForm').reset();
      if (onAuthenticated) onAuthenticated(data.user);
    } catch (err) {
      showError(err.message);
    }
  });

  $('authSwitchLink').addEventListener('click', (e) => {
    e.preventDefault();
    setMode(mode === 'login' ? 'register' : 'login');
    $('authError').classList.add('hidden');
  });

  $('logoutBtn').onclick = () => {
    clearAuth();
    $('currentUser').textContent = '';
    showAuth('login');
  };
}
