"""ORM 数据模型 — 与前端 state 结构一一对应。

前端数据结构（localStorage kanban.v2）：
  {
    projects: [{
      id, name,
      columns: [{ id, name, cards: [{ id, title, desc, assignee, due, priority, tags }] }],
      documents: [{ id, title, intro, content, status }]
    }]
  }
"""

import sqlalchemy as sa
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


class User(Base):
    __tablename__ = "users"

    id = sa.Column(sa.String(32), primary_key=True, index=True)
    username = sa.Column(sa.String(64), unique=True, nullable=False, index=True)
    password_hash = sa.Column(sa.String(128), nullable=False)
    created_at = sa.Column(sa.DateTime, server_default=func.now())


class Project(Base):
    __tablename__ = "projects"

    id = sa.Column(sa.String(32), primary_key=True, index=True)
    name = sa.Column(sa.String(128), nullable=False)
    version = sa.Column(sa.Integer, nullable=False, default=0)   # 乐观锁版本号
    created_at = sa.Column(sa.DateTime, server_default=func.now())
    updated_at = sa.Column(sa.DateTime, server_default=func.now(), onupdate=func.now())

    columns = relationship("Column", back_populates="project",
                           cascade="all, delete-orphan",
                           order_by="Column.position")
    documents = relationship("Document", back_populates="project",
                             cascade="all, delete-orphan")


class Column(Base):
    __tablename__ = "columns"

    id = sa.Column(sa.String(32), primary_key=True, index=True)
    project_id = sa.Column(sa.String(32), sa.ForeignKey("projects.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    name = sa.Column(sa.String(64), nullable=False)
    position = sa.Column(sa.Integer, nullable=False, default=0)
    version = sa.Column(sa.Integer, nullable=False, default=0)   # 乐观锁版本号

    project = relationship("Project", back_populates="columns")
    cards = relationship("Card", back_populates="column",
                         cascade="all, delete-orphan",
                         order_by="Card.created_at")


class Card(Base):
    __tablename__ = "cards"

    id = sa.Column(sa.String(32), primary_key=True, index=True)
    column_id = sa.Column(sa.String(32), sa.ForeignKey("columns.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    title = sa.Column(sa.String(256), nullable=False)
    desc = sa.Column(sa.Text, default="")
    assignee = sa.Column(sa.String(64), default="")
    due = sa.Column(sa.String(10), default="")       # ISO 日期 "YYYY-MM-DD"
    priority = sa.Column(sa.String(10), default="medium")  # high / medium / low
    tags = sa.Column(sa.Text, default="[]")          # JSON 数组字符串
    version = sa.Column(sa.Integer, nullable=False, default=0)   # 乐观锁版本号
    created_at = sa.Column(sa.DateTime, server_default=func.now())
    updated_at = sa.Column(sa.DateTime, server_default=func.now(), onupdate=func.now())

    column = relationship("Column", back_populates="cards")


class Document(Base):
    """文档已退化为「纯笔记」：正文走 Yjs（collab 服务 leveldb 持久化），
    SQLite 只保留 title 作为列表索引（last-write-wins，无乐观锁）。"""
    __tablename__ = "documents"

    id = sa.Column(sa.String(32), primary_key=True, index=True)
    project_id = sa.Column(sa.String(32), sa.ForeignKey("projects.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    title = sa.Column(sa.String(256), nullable=False, default="未命名文档")
    created_at = sa.Column(sa.DateTime, server_default=func.now())
    updated_at = sa.Column(sa.DateTime, server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="documents")
