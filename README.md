# Notepad

mini-Affine — 个人看板与知识管理工具。

把 Affine 的核心体验拆成两件事：**看板管理任务进度**，**文档记录知识资产**，通过同一个状态栏汇总在一起。数据可纯本地运行（浏览器 localStorage），也可接入后端实现跨设备同步。

## 技术栈

| 层     | 技术                                       |
| ------ | ------------------------------------------ |
| 前端   | 原生 HTML / CSS / JavaScript，零框架零依赖 |
| 后端   | Python FastAPI + SQLAlchemy + SQLite       |
| 包管理 | uv（PyPI 清华源）                          |
| 数据流 | localStorage 即时读写 → 后端异步镜像       |

## 目录结构

```
notepad/
├── web/                  # 前端（纯静态）
│   ├── index.html        #   页面结构
│   ├── style.css         #   样式
│   └── app.js            #   逻辑 + API 适配层
├── backend/              # 后端（FastAPI）
│   ├── pyproject.toml    #   项目配置 & 依赖
│   ├── main.py           #   入口：CORS / 建表 / 静态文件
│   ├── database.py       #   SQLAlchemy 引擎与会话
│   ├── models.py         #   ORM 模型（Project/Column/Card/Document）
│   ├── schemas.py        #   Pydantic 请求/响应模型
│   └── routers.py        #   REST API（14 个端点）
└── README.md
```

## 快速开始

### 纯前端模式（无需后端）

```bash
cd web
npx http-server -c-1 -p 8123
# 浏览器打开 http://127.0.0.1:8123
```

数据存于浏览器 localStorage，刷新不丢失。换设备需手动导出。

### 前端 + 后端模式（跨设备同步）

后端：

```bash
cd backend
uv sync                           # 安装依赖（已配置清华源）
uv run uvicorn main:app --host 127.0.0.1 --port 8080 --reload
```

前端（另开终端）：

```bash
cd web
npx http-server -c-1 -p 8123
```

浏览器打开 `http://127.0.0.1:8123`。后端运行时，数据自动双写到 localStorage 和 SQLite；后端不可达时所有功能照常（降级为纯本地模式）。

### API 文档

后端启动后访问 `http://127.0.0.1:8080/docs` 可交互式调试所有 API。

## 功能

- **多项目管理** — 侧边栏切换/新建/重命名/删除，各项目独立看板
- **看板列** — 自定义阶段（需求池 → 进行中 → 已完成），列 CRUD、拖拽排序
- **任务卡片** — 标题/描述/负责人/截止日期/优先级/标签，跨列拖拽
- **文档** — 全页编辑器（标题/简介/正文/状态），保存后自动按状态同步至看板列，侧边栏各项目下可展开文档列表
- **进度统计** — 顶部进度条实时汇总（任务 + 文档）
- **搜索过滤** — 按标题/描述/负责人/标签即时筛选

## API 概览

| 端点                                 | 说明                               |
| ------------------------------------ | ---------------------------------- |
| `GET /api/projects`                  | 项目列表（含计数）                 |
| `GET /api/projects/{id}`             | 完整项目（嵌套列 → 卡片 + 文档）   |
| `POST /api/projects`                 | 新建项目（可带初始列）             |
| `PUT /api/projects/{id}`             | 重命名项目                         |
| `DELETE /api/projects/{id}`          | 删除项目（级联）                   |
| `PUT /api/projects/{id}/sync`        | **全量同步** — 前端 state 一键写入 |
| `POST/PUT/DELETE /api/columns/...`   | 列 CRUD                            |
| `POST/PUT/DELETE /api/cards/...`     | 卡片 CRUD（跨列移动）              |
| `POST/PUT/DELETE /api/documents/...` | 文档 CRUD                          |

## 许可

MIT
