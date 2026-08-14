"""REST API 路由 — 项目/列/卡片/文档 的 CRUD + 全量同步。

写操作采用乐观锁：请求携带 version，后端比对，不匹配返回 409。
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Project, Column, Card, Document
from sse import broadcast
from schemas import (
    ProjectCreate, ProjectUpdate, ProjectOut, ProjectSummary, ProjectSync,
    ColumnCreate, ColumnUpdate, ColumnOut,
    CardCreate, CardUpdate, CardOut,
    DocumentCreate, DocumentUpdate, DocumentOut,
)

router = APIRouter(prefix="/api")


# ═══════════════════════════════════════════
#  辅助函数
# ═══════════════════════════════════════════

def _get_project_or_404(db: Session, project_id: str) -> Project:
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="项目不存在")
    return p

def _get_column_or_404(db: Session, column_id: str) -> Column:
    c = db.query(Column).filter(Column.id == column_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="列不存在")
    return c

def _check_version(obj, expected_version: Optional[int]):
    """乐观锁校验：版本号不匹配则冲突。expected_version 为 None 时跳过。"""
    if expected_version is not None and obj.version != expected_version:
        raise HTTPException(status_code=409, detail="数据已被他人修改，请刷新后重试")

def _build_project_out(p: Project) -> dict:
    """将 ORM Project 转为嵌套字典（含 columns → cards 和 documents）。"""
    return {
        "id": p.id,
        "name": p.name,
        "version": p.version,
        "columns": [
            {
                "id": c.id,
                "project_id": c.project_id,
                "name": c.name,
                "position": c.position,
                "version": c.version,
                "cards": [
                    CardOut.model_validate(card).model_dump()
                    for card in c.cards
                ],
            }
            for c in p.columns
        ],
        "documents": [DocumentOut.model_validate(d).model_dump() for d in p.documents],
        "created_at": p.created_at,
        "updated_at": p.updated_at,
    }


# ═══════════════════════════════════════════
#  项目
# ═══════════════════════════════════════════

@router.get("/projects", response_model=list[ProjectSummary])
def list_projects(db: Session = Depends(get_db)):
    projects = db.query(Project).order_by(Project.updated_at.desc()).all()
    result = []
    for p in projects:
        col_count = len(p.columns)
        card_count = sum(len(c.cards) for c in p.columns)
        doc_count = len(p.documents)
        result.append({
            "id": p.id,
            "name": p.name,
            "version": p.version,
            "column_count": col_count,
            "card_count": card_count,
            "document_count": doc_count,
            "created_at": p.created_at,
            "updated_at": p.updated_at,
        })
    return result


@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: str, db: Session = Depends(get_db)):
    p = (
        db.query(Project)
        .options(
            joinedload(Project.columns).joinedload(Column.cards),
            joinedload(Project.documents),
        )
        .filter(Project.id == project_id)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="项目不存在")
    return _build_project_out(p)


@router.post("/projects", response_model=ProjectOut, status_code=201)
def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    if db.query(Project).filter(Project.id == body.id).first():
        raise HTTPException(status_code=409, detail="项目 ID 已存在")

    project = Project(id=body.id, name=body.name)
    db.add(project)

    # 初始列（空列，卡片由前端单独创建）
    for i, col_data in enumerate(body.columns):
        db.add(Column(
            id=col_data.id,
            project_id=body.id,
            name=col_data.name,
            position=col_data.position if col_data.position else i,
        ))

    # 初始文档
    for doc_data in body.documents:
        db.add(Document(
            id=doc_data.id,
            project_id=body.id,
            title=doc_data.title,
            tags=doc_data.tags,
            priority=doc_data.priority,
            due=doc_data.due,
            assignee=doc_data.assignee,
        ))

    db.commit()
    db.refresh(project)
    broadcast(body.id)
    return _build_project_out(project)


@router.put("/projects/{project_id}", response_model=ProjectOut)
def update_project(project_id: str, body: ProjectUpdate, db: Session = Depends(get_db)):
    p = _get_project_or_404(db, project_id)
    _check_version(p, body.version)
    if body.name is not None:
        p.name = body.name
    p.version += 1
    db.commit()
    db.refresh(p)
    broadcast(project_id)
    return _build_project_out(p)


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(project_id: str, db: Session = Depends(get_db)):
    p = _get_project_or_404(db, project_id)
    db.delete(p)
    db.commit()
    broadcast(project_id)


# ═══════════════════════════════════════════
#  看板列
# ═══════════════════════════════════════════

@router.post("/projects/{project_id}/columns", response_model=ColumnOut, status_code=201)
def add_column(project_id: str, body: ColumnCreate, db: Session = Depends(get_db)):
    _get_project_or_404(db, project_id)
    col = Column(
        id=body.id,
        project_id=project_id,
        name=body.name,
        position=body.position,
    )
    db.add(col)
    db.commit()
    db.refresh(col)
    broadcast(project_id)
    return ColumnOut.model_validate(col)


@router.put("/columns/{column_id}", response_model=ColumnOut)
def update_column(column_id: str, body: ColumnUpdate, db: Session = Depends(get_db)):
    col = _get_column_or_404(db, column_id)
    _check_version(col, body.version)
    if body.name is not None:
        col.name = body.name
    if body.position is not None:
        col.position = body.position
    col.version += 1
    db.commit()
    db.refresh(col)
    broadcast(col.project_id)
    return ColumnOut.model_validate(col)


@router.delete("/columns/{column_id}", status_code=204)
def delete_column(column_id: str, db: Session = Depends(get_db)):
    col = _get_column_or_404(db, column_id)
    db.delete(col)
    db.commit()
    broadcast(col.project_id)


# ═══════════════════════════════════════════
#  任务卡片
# ═══════════════════════════════════════════

@router.post("/columns/{column_id}/cards", response_model=CardOut, status_code=201)
def add_card(column_id: str, body: CardCreate, db: Session = Depends(get_db)):
    col = _get_column_or_404(db, column_id)
    card = Card(
        id=body.id,
        column_id=column_id,
        title=body.title,
        desc=body.desc,
        assignee=body.assignee,
        due=body.due,
        priority=body.priority,
        tags=body.tags,
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    broadcast(col.project_id)
    return CardOut.model_validate(card)


@router.put("/cards/{card_id}", response_model=CardOut)
def update_card(card_id: str, body: CardUpdate, db: Session = Depends(get_db)):
    card = db.query(Card).filter(Card.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="卡片不存在")
    _check_version(card, body.version)
    for field in ("title", "desc", "assignee", "due", "priority", "tags", "column_id"):
        val = getattr(body, field, None)
        if val is not None:
            setattr(card, field, val)
    if body.column_id and body.column_id != card.column_id:
        _get_column_or_404(db, body.column_id)   # 确保目标列存在
    card.version += 1
    db.commit()
    db.refresh(card)
    broadcast(card.column.project_id)
    return CardOut.model_validate(card)


@router.delete("/cards/{card_id}", status_code=204)
def delete_card(card_id: str, db: Session = Depends(get_db)):
    card = db.query(Card).filter(Card.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="卡片不存在")
    pid = card.column.project_id
    db.delete(card)
    db.commit()
    broadcast(pid)


# ═══════════════════════════════════════════
#  文档
# ═══════════════════════════════════════════

@router.post("/projects/{project_id}/documents", response_model=DocumentOut, status_code=201)
def add_document(project_id: str, body: DocumentCreate, db: Session = Depends(get_db)):
    _get_project_or_404(db, project_id)
    doc = Document(
        id=body.id,
        project_id=project_id,
        title=body.title,
        tags=body.tags,
        priority=body.priority,
        due=body.due,
        assignee=body.assignee,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    broadcast(project_id)
    return DocumentOut.model_validate(doc)


@router.put("/documents/{doc_id}", response_model=DocumentOut)
def update_document(doc_id: str, body: DocumentUpdate, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    # 元数据 last-write-wins（无乐观锁）：正文走 Yjs 无冲突，元数据单值字段「最后写的赢」即可
    for field in ("title", "tags", "priority", "due", "assignee"):
        val = getattr(body, field, None)
        if val is not None:
            setattr(doc, field, val)
    db.commit()
    db.refresh(doc)
    broadcast(doc.project_id)
    return DocumentOut.model_validate(doc)


@router.delete("/documents/{doc_id}", status_code=204)
def delete_document(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    pid = doc.project_id
    db.delete(doc)
    db.commit()
    broadcast(pid)


# ═══════════════════════════════════════════
#  全量同步（前端 state → 后端）
# ═══════════════════════════════════════════

@router.put("/projects/{project_id}/sync", response_model=ProjectOut)
def sync_project(project_id: str, body: ProjectSync, db: Session = Depends(get_db)):
    """将前端整个项目 state 同步到后端。
    先清空项目下所有列/卡片/文档，再用新数据重建。
    适用于迁移和全量保存场景。
    """
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        p = Project(id=project_id, name=body.name)
        db.add(p)
    else:
        p.name = body.name
        p.version += 1

    # 清空旧数据
    db.query(Card).filter(Card.column.has(project_id=project_id)).delete(synchronize_session=False)
    db.query(Column).filter(Column.project_id == project_id).delete(synchronize_session=False)
    db.query(Document).filter(Document.project_id == project_id).delete(synchronize_session=False)

    # 重建列
    for col_data in body.columns:
        db.add(Column(
            id=col_data.id,
            project_id=project_id,
            name=col_data.name,
            position=col_data.position,
        ))
    db.flush()

    # 重建卡片
    for col_id, cards in body.cards.items():
        for card_data in cards:
            db.add(Card(
                id=card_data.id,
                column_id=col_id,
                title=card_data.title,
                desc=card_data.desc,
                assignee=card_data.assignee,
                due=card_data.due,
                priority=card_data.priority,
                tags=card_data.tags,
            ))

    # 重建文档
    for doc_data in body.documents:
        db.add(Document(
            id=doc_data.id,
            project_id=project_id,
            title=doc_data.title,
            tags=doc_data.tags,
            priority=doc_data.priority,
            due=doc_data.due,
            assignee=doc_data.assignee,
        ))

    db.commit()
    db.refresh(p)
    broadcast(project_id)
    return _build_project_out(p)
