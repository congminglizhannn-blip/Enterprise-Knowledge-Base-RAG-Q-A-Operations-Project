from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.knowledge_bases import get_accessible_kb
from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.chat import ChatMessage, ChatSession
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.session import ChatSessionCreate, ChatSessionDetail, ChatSessionRead

router = APIRouter()


def get_accessible_session(db: Session, session_id: str, user: User) -> ChatSession:
    stmt = select(ChatSession).where(ChatSession.id == session_id)
    if user.role != UserRole.SUPER_ADMIN:
        stmt = stmt.where(ChatSession.user_id == user.id, ChatSession.department_id == user.department_id)
    session = db.scalar(stmt)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在或无权限")
    return session


@router.get("", response_model=list[ChatSessionRead])
def list_sessions(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(ChatSession).order_by(ChatSession.updated_at.desc()).limit(50)
    if current_user.role != UserRole.SUPER_ADMIN:
        stmt = stmt.where(ChatSession.user_id == current_user.id, ChatSession.department_id == current_user.department_id)
    return db.scalars(stmt).all()


@router.post("", response_model=ChatSessionRead)
def create_session(payload: ChatSessionCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    kb = get_accessible_kb(db, payload.knowledge_base_id, current_user)
    session = ChatSession(
        user_id=current_user.id,
        knowledge_base_id=kb.id,
        department_id=kb.department_id,
        title=(payload.title or "新会话")[:180],
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/{session_id}", response_model=ChatSessionDetail)
def get_session(session_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = get_accessible_session(db, session_id, current_user)
    session = db.scalar(
        select(ChatSession)
        .options(selectinload(ChatSession.messages))
        .where(ChatSession.id == session.id)
    )
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在或无权限")
    session.messages.sort(key=lambda message: message.created_at)
    return session


@router.delete("/{session_id}")
def delete_session(session_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = get_accessible_session(db, session_id, current_user)
    db.delete(session)
    db.commit()
    return {"success": True}
