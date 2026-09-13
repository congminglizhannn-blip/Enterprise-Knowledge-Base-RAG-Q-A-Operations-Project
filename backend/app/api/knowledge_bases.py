from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies import get_current_user, require_department_admin
from app.models.enums import UserRole
from app.models.knowledge_base import KnowledgeBase
from app.models.user import User
from app.schemas.kb import KnowledgeBaseCreate, KnowledgeBaseRead

router = APIRouter()


@router.get("", response_model=list[KnowledgeBaseRead])
def list_knowledge_bases(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(KnowledgeBase)
    if current_user.role != UserRole.SUPER_ADMIN:
        stmt = stmt.where(KnowledgeBase.department_id == current_user.department_id)
    return db.scalars(stmt).all()


@router.post("", response_model=KnowledgeBaseRead)
def create_knowledge_base(payload: KnowledgeBaseCreate, current_user: User = Depends(require_department_admin), db: Session = Depends(get_db)):
    kb = KnowledgeBase(
        name=payload.name,
        description=payload.description,
        department_id=current_user.department_id,
        created_by=current_user.id,
    )
    db.add(kb)
    db.commit()
    db.refresh(kb)
    return kb


def get_accessible_kb(db: Session, kb_id: str, user: User) -> KnowledgeBase:
    stmt = select(KnowledgeBase).where(KnowledgeBase.id == kb_id)
    if user.role != UserRole.SUPER_ADMIN:
        stmt = stmt.where(KnowledgeBase.department_id == user.department_id)
    kb = db.scalar(stmt)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在或无权限")
    return kb
