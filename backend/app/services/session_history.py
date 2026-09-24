from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import update

from app.models.chat import ChatMessage, ChatSession
from app.models.enums import MessageRole


def new_session(user, kb_id, title):
    return ChatSession(user_id=user.id, knowledge_base_id=kb_id, org_id=user.org_id,
                       department_id=user.department_id, user_name_snapshot=user.full_name or user.username,
                       title=title[:180] or "新会话", round_count=0)


def prepare_session(db, user, kb_id, title, previous=None):
    if previous is not None and previous.user_id != user.id:
        raise HTTPException(403, detail="审计会话仅可查看，不能以他人身份继续问答")
    if previous is not None and (previous.knowledge_base_id, previous.org_id, previous.department_id) == (kb_id, user.org_id, user.department_id):
        return previous
    session = new_session(user, kb_id, title)
    db.add(session)
    db.flush()
    return session


def save_round(db, session, question, answer, citations):
    now = datetime.now(UTC)
    db.add_all([
        ChatMessage(session_id=session.id, role=MessageRole.USER, content=question, retrieved_chunks=None),
        ChatMessage(session_id=session.id, role=MessageRole.ASSISTANT, content=answer, retrieved_chunks=citations),
    ])
    # SQL increment avoids lost counts when two answers finish concurrently.
    db.execute(update(ChatSession).where(ChatSession.id == session.id).values(
        round_count=ChatSession.round_count + 1, updated_at=now,
    ))
    db.commit()
