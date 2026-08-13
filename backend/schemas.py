"""Pydantic schemas — API 请求与响应模型。

与前端 localStorage 中的 state 结构保持一致，
方便前端直接抹平 API 数据和本地状态。
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

# ──── User（用户与认证） ────

class UserCreate(BaseModel):
    username: str = Field(..., min_length=2, max_length=64)
    password: str = Field(..., min_length=6, max_length=128)

class UserLogin(BaseModel):
    username: str
    password: str

class UserOut(BaseModel):
    id: str
    username: str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

# ──── Card（任务卡片） ────

class CardBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    desc: str = ""
    assignee: str = ""
    due: str = ""                   # "YYYY-MM-DD"
    priority: str = "medium"        # high / medium / low
    tags: str = "[]"                # JSON 字符串

class CardCreate(CardBase):
    id: str                         # 前端生成的 uid

class CardUpdate(BaseModel):
    title: Optional[str] = None
    desc: Optional[str] = None
    assignee: Optional[str] = None
    due: Optional[str] = None
    priority: Optional[str] = None
    tags: Optional[str] = None
    column_id: Optional[str] = None  # 拖动到别的列时更新
    version: Optional[int] = None    # 乐观锁版本号（前端读到的最新版本）

class CardOut(CardBase):
    id: str
    column_id: str
    version: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ──── Column（看板列 / 阶段） ────

class ColumnBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)

class ColumnCreate(ColumnBase):
    id: str
    position: int = 0

class ColumnUpdate(BaseModel):
    name: Optional[str] = None
    position: Optional[int] = None
    version: Optional[int] = None

class ColumnOut(BaseModel):
    id: str
    project_id: str
    name: str
    position: int = 0
    version: int = 0
    cards: list[CardOut] = []

    model_config = {"from_attributes": True}


# ──── Document（文档） ────

class DocumentBase(BaseModel):
    title: str = Field(default="未命名文档", max_length=256)
    intro: str = ""
    content: str = ""
    status: str = ""                # 列 id
    assignee: str = ""
    due: str = ""
    priority: str = "medium"        # high / medium / low
    tags: str = "[]"                # JSON 字符串

class DocumentCreate(DocumentBase):
    id: str

class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    intro: Optional[str] = None
    content: Optional[str] = None
    status: Optional[str] = None
    assignee: Optional[str] = None
    due: Optional[str] = None
    priority: Optional[str] = None
    tags: Optional[str] = None
    version: Optional[int] = None

class DocumentOut(DocumentBase):
    id: str
    project_id: str
    version: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ──── Project（项目） ────

class ProjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)

class ProjectCreate(ProjectBase):
    id: str
    columns: list[ColumnCreate] = []
    documents: list[DocumentCreate] = []

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    version: Optional[int] = None

class ProjectSummary(BaseModel):
    """项目列表摘要（不含嵌套）"""
    id: str
    name: str
    version: int = 0
    column_count: int = 0
    card_count: int = 0
    document_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

class ProjectOut(ProjectBase):
    """完整项目（含列、卡片、文档）"""
    id: str
    version: int = 0
    columns: list[ColumnOut] = []
    documents: list[DocumentOut] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ──── 全量同步 ────

class ProjectSync(BaseModel):
    """前端 state.projects[i] 的全量同步载荷。
    后端收到后删除该项目所有现有数据，用新数据重建。
    """
    name: str
    columns: list[ColumnCreate] = []
    documents: list[DocumentCreate] = []
    cards: dict[str, list[CardCreate]] = {}  # column_id → [cards]
