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


class Project(Base):
    __tablename__ = "projects"

    id = sa.Column(sa.String(32), primary_key=True, index=True)
    name = sa.Column(sa.String(128), nullable=False)
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
    created_at = sa.Column(sa.DateTime, server_default=func.now())
    updated_at = sa.Column(sa.DateTime, server_default=func.now(), onupdate=func.now())

    column = relationship("Column", back_populates="cards")


class Document(Base):
    __tablename__ = "documents"

    id = sa.Column(sa.String(32), primary_key=True, index=True)
    project_id = sa.Column(sa.String(32), sa.ForeignKey("projects.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    title = sa.Column(sa.String(256), nullable=False, default="未命名文档")
    intro = sa.Column(sa.Text, default="")
    content = sa.Column(sa.Text, default="")
    status = sa.Column(sa.String(32), default="")    # 所在列的 id
    assignee = sa.Column(sa.String(64), default="")
    due = sa.Column(sa.String(10), default="")       # ISO 日期 "YYYY-MM-DD"
    priority = sa.Column(sa.String(10), default="medium")  # high / medium / low
    tags = sa.Column(sa.Text, default="[]")           # JSON 数组字符串
    created_at = sa.Column(sa.DateTime, server_default=func.now())
    updated_at = sa.Column(sa.DateTime, server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="documents")
