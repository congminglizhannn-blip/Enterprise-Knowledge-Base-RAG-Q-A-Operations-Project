from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.knowledge_bases import get_accessible_kb
from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.chat import ChatSession
from app.models.user import User
from app.schemas.session import ChatSessionCreate, ChatSessionDetail, ChatSessionRead, ChatSessionListRead
from app.services.history_scope import apply_data_scope, get_data_scope
from app.services.session_history import new_session

router = APIRouter()


def get_accessible_session(db: Session, session_id: str, user: User) -> ChatSession:
    stmt = apply_data_scope(select(ChatSession).where(ChatSession.id == session_id), get_data_scope(db, user))
    session = db.scalar(stmt)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在或无权限")
    return session


@router.get("", response_model=list[ChatSessionListRead])
def list_sessions(current_user: User = Depends(get_current_user), db: Session = Depends(get_db), scope: Literal["mine", "audit"] = "audit"):
    # Personal chat history is based on ownership, including the user's old department snapshots.
    if scope == "mine":
        stmt = select(ChatSession).where(ChatSession.user_id == current_user.id)
    else:
        stmt = apply_data_scope(select(ChatSession), get_data_scope(db, current_user))
    stmt = stmt.order_by(ChatSession.updated_at.desc(), ChatSession.id).limit(50)
    sessions = db.scalars(stmt).all()
    if not sessions:
        return []
    return [
        ChatSessionListRead(
            **ChatSessionRead.model_validate(session).model_dump(),
            qa_round_count=session.round_count,
        )
        for session in sessions
    ]


@router.post("", response_model=ChatSessionRead)
def create_session(payload: ChatSessionCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    kb = get_accessible_kb(db, payload.knowledge_base_id, current_user)
    session = new_session(current_user, kb.id, payload.title or "新会话")
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
    if session.user_id != current_user.id:
        raise HTTPException(403, detail="审计会话仅可查看，不能删除他人会话")
    db.delete(session)
    db.commit()
    return {"success": True}
