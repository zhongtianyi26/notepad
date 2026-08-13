"""Notepad — mini-Affine 后端入口。

启动方式（开发）：
    cd backend
    uv run uvicorn main:app --host 127.0.0.1 --port 8080 --reload

前端服务可独立启动：
    cd web
    npx http-server -c-1 -p 8123

API 文档（启动后访问）：
    http://127.0.0.1:8080/docs          Swagger UI
    http://127.0.0.1:8080/redoc         ReDoc
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import engine, Base
from routers import router
from auth_router import router as auth_router
from sse import router as sse_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """启动时自动建表（已在数据库中存在的表不会重复创建）。"""
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Notepad API",
    description="mini-Affine 看板与知识管理 — 后端服务",
    version="0.2.1",
    lifespan=lifespan,
)

# CORS — 开发阶段放行所有来源
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 路由
app.include_router(router)
app.include_router(auth_router)
app.include_router(sse_router)


@app.get("/health")
def health():
    """健康检查"""
    return {"status": "ok"}


# 可选：由同一个服务托管前端静态文件（生产部署用）
# 取消下方注释即可。注意：请用 app.mount("/", ...) 前确保 API 路由
# （如 /api/*）已在更上层注册，否则静态文件可能覆盖 API。
# 开发时建议前后端分开启动，不启用此行：
#
#   import os
#   web_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "web"))
#   if os.path.isdir(web_dir):
#       app.mount("/", StaticFiles(directory=web_dir, html=True), name="static")
