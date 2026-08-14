# Notepad

mini-Affine — 个人看板与知识管理工具。

把 Affine 的核心体验拆成两件事：**看板管理任务进度**，**文档记录知识资产**，通过同一个状态栏汇总在一起。结构化数据（任务/列/项目/文档元信息）由 SQLite 存储、SSE 实时同步；**文档正文走 Yjs 实时协同**。

## 技术栈

| 层     | 技术                                       |
| ------ | ------------------------------------------ |
| 前端   | 原生 JS（ES 模块）+ Vite 构建 + Tiptap 富文本编辑器 |
| 正文协同 | Yjs + y-prosemirror + Tiptap Collaboration（WebSocket） |
| 协同服务 | Node y-websocket + y-leveldb 持久化         |
| 后端   | Python FastAPI + SQLAlchemy + SQLite       |
| 包管理 | uv（后端，清华源）+ npm（前端/collab，npmmirror） |
| 数据流 | 结构化数据走 SQLite + SSE；正文走 Yjs WebSocket |
| 并发   | 结构化字段乐观锁（version，409）；正文 CRDT 自动合并 |

## 目录结构

```
notepad/
├── web/                  # 前端（Vite + Tiptap）
│   ├── index.html        #   页面结构
│   ├── style.css         #   样式
│   ├── package.json      #   依赖与脚本
│   ├── vite.config.js    #   Vite 配置（dev server 5173）
│   └── js/               #   ES 模块
│       ├── main.js       #     入口：事件绑定 / 鉴权 / SSE 同步
│       ├── config.js     #     后端地址 / 存储 key
│       ├── state.js      #     数据层：状态 / normalize / 工具
│       ├── api.js        #     后端同步：REST + SSE
│       ├── render.js     #     侧边栏 / 看板 / 卡片渲染 + 拖拽
│       ├── dialogs.js    #     任务 / 列 / 项目 / 文档弹窗
│       ├── auth.js       #     登录 / 注册 / token 管理
│       └── editor.js     #     Tiptap 富文本编辑器（任务链接 mark）
├── backend/              # 后端（FastAPI）
│   ├── pyproject.toml    #   项目配置 & 依赖
│   ├── main.py           #   入口：CORS / 建表 / 路由挂载
│   ├── database.py       #   SQLAlchemy 引擎与会话
│   ├── models.py         #   ORM 模型（User/Project/Column/Card/Document）
│   ├── schemas.py        #   Pydantic 请求/响应模型
│   ├── routers.py        #   REST API（CRUD + 乐观锁）
│   ├── auth.py           #   密码哈希 + JWT
│   ├── auth_router.py    #   注册 / 登录 / me
│   └── sse.py            #   SSE 实时广播
├── collab/              # 正文协同服务（Yjs + y-websocket）
│   ├── server.js        #   ws://localhost:1234，leveldb 持久化
│   └── package.json     #   依赖与启动脚本
└── README.md
```

## 快速开始

### 后端

```bash
cd backend
uv sync                           # 安装依赖（已配置清华源）
uv run uvicorn main:app --host 127.0.0.1 --port 8080 --reload
```

### 协同服务（正文实时协同）

```bash
cd collab
npm install                       # 安装依赖（已配置 npmmirror）
npm start                         # ws://localhost:1234
```

### 前端

```bash
cd web
npm install                       # 安装依赖（已配置 npmmirror）
npm run dev                       # Vite dev server
# 浏览器打开 http://127.0.0.1:5173
```

前端通过绝对地址 `http://127.0.0.1:8080/api` 访问后端，正文通过 `ws://localhost:1234` 连接协同服务。**三个进程需同时运行**（后端 8080 + 协同 1234 + 前端 5173），前后端分离运行，CORS 已放行。

### API 文档

后端启动后访问 `http://127.0.0.1:8080/docs` 可交互式调试所有 API。

## 功能

- **多项目管理** — 侧边栏切换 / 新建 / 重命名 / 删除，各项目独立看板
- **看板列** — 自定义阶段，列 CRUD、跨列拖拽
- **任务卡片** — 标题 / 描述 / 负责人 / 截止日期 / 优先级 / 标签
- **文档（纯笔记）** — 富文本编辑器（Tiptap），正文走 Yjs 实时协同、自动保存，标题自动提取（首标题→首段），只出现在侧边栏、不进看板列
- **正文建任务** — 选中正文文字 → 弹「创建任务」按钮 → 建任务后文字变超链接 → 点击跳转看板任务
- **进度统计** — 顶部进度条实时汇总
- **搜索过滤** — 按标题 / 描述 / 负责人 / 标签即时筛选
- **多人协作** — 注册登录，结构化字段乐观锁防冲突 + SSE 同步，正文 CRDT 实时协同

## API 概览

| 端点                                   | 说明                               |
| -------------------------------------- | ---------------------------------- |
| `GET /api/projects`                    | 项目列表（含计数）                 |
| `GET /api/projects/{id}`               | 完整项目（嵌套列 → 卡片 + 文档）   |
| `POST /api/projects`                   | 新建项目（可带初始列）             |
| `PUT /api/projects/{id}`               | 重命名项目（乐观锁）               |
| `DELETE /api/projects/{id}`            | 删除项目（级联）                   |
| `PUT /api/projects/{id}/sync`          | 全量同步                           |
| `POST/PUT/DELETE /api/columns/...`     | 列 CRUD                            |
| `POST/PUT/DELETE /api/cards/...`       | 卡片 CRUD（跨列移动）              |
| `POST/PUT/DELETE /api/documents/...`   | 文档 CRUD                          |
| `POST /api/auth/register`              | 注册                               |
| `POST /api/auth/login`                 | 登录                               |
| `GET /api/auth/me`                     | 当前用户                           |
| `GET /api/events`                      | SSE 实时事件流                     |

## 许可

MIT
