// Notepad 文档协同服务（Yjs + y-websocket）
// 启动：npm start  →  ws://localhost:1234
// 每个文档一个「房间」（room = 文档 id），客户端通过 WebsocketProvider 连接。

import http from 'http';
import { createRequire } from 'module';
import { WebSocketServer } from 'ws';

// 关键：yjs / y-websocket / y-leveldb 统一用 CJS 方式加载（require），确保三者共享
// 同一个 dist/yjs.cjs 实例。若混用 ESM `import`（会加载 dist/yjs.mjs 或各包的 ESM 入口），
// 会产生多个 yjs 实例，触发 "Yjs was already imported" 警告，导致跨实例
// encodeStateAsUpdate/applyUpdate 失效、客户端增量同步丢更新。
const require = createRequire(import.meta.url);
const Y = require('yjs');
const { setupWSConnection, setPersistence } = require('y-websocket/bin/utils');
const { LeveldbPersistence } = require('y-leveldb');

const PORT = process.env.PORT || 1234;

// leveldb 持久化：重启后协同文档不丢
const persistence = new LeveldbPersistence('./db');

// 预加载缓存：docName → 完整 state update（Uint8Array）。
// 解决 y-websocket 官方 getYDoc 未 await bindState 导致的时序竞态：
// 客户端「保存→关闭→重进」时，新 room 的 doc 在 leveldb 数据加载完成前就响应 sync，
// 客户端拿到空数据、误判为空文档而用旧 content 迁移，导致正文叠加/协同失效。
// 通过内存缓存让 bindState 能「同步」应用已持久化的最新 state，消除 await 竞态窗口。
const stateCache = new Map();

setPersistence({
  bindState: async (docName, ydoc) => {
    const cached = stateCache.get(docName);
    if (cached) {
      Y.applyUpdate(ydoc, cached);   // 命中缓存：同步应用，无 await 竞态
      return;
    }
    const persisted = await persistence.getYDoc(docName);
    const update = Y.encodeStateAsUpdate(persisted);
    stateCache.set(docName, update);
    Y.applyUpdate(ydoc, update);
  },
  writeState: async (docName, ydoc) => {
    const update = Y.encodeStateAsUpdate(ydoc);
    stateCache.set(docName, update);   // 同步更新缓存（在 await 之前，关闭后立即重进也能读到最新）
    await persistence.storeUpdate(docName, update);
    return true;
  },
});

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Notepad collab server');
});

const wss = new WebSocketServer({ server });
wss.on('connection', (ws, req) => {
  setupWSConnection(ws, req);
});

server.listen(PORT, () => {
  console.log(`Yjs collab server running on ws://localhost:${PORT}`);
});
