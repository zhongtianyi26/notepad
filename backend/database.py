"""SQLAlchemy 引擎与会话工厂。

默认使用 `notepad.db` 作为 SQLite 数据库文件，可用环境变量
`NOTEPAD_DB` 覆盖（如 `NOTEPAD_DB=sqlite:///test.db`）。
"""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.environ.get("NOTEPAD_DB", "sqlite:///notepad.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI 依赖注入：每次请求获取一个数据库会话，请求结束后自动关闭。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
