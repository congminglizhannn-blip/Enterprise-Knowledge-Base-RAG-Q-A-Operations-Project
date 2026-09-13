import json

from fastapi import APIRouter, Depends
from sse_starlette.sse import EventSourceResponse
from sqlalchemy.orm import Session

from app.api.knowledge_bases import get_accessible_kb
from app.api.sessions import get_accessible_session
from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.chat import ChatMessage, ChatSession
from app.models.enums import MessageRole
from app.models.user import User
from app.schemas.chat import ChatRequest
from app.services.chat_service import build_prompt, is_flow_question, stream_deepseek_answer
from app.services.embedding import get_embedding_service
from app.services.retriever import RetrieverService

router = APIRouter()


@router.post("/stream")
async def stream_chat(payload: ChatRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    kb = get_accessible_kb(db, payload.knowledge_base_id, current_user)
    if payload.session_id:
        session = get_accessible_session(db, payload.session_id, current_user)
        if session.knowledge_base_id != kb.id:
            session.knowledge_base_id = kb.id
            session.department_id = kb.department_id
    else:
        session = ChatSession(
            user_id=current_user.id,
            knowledge_base_id=kb.id,
            department_id=kb.department_id,
            title=payload.question[:60] or "新会话",
        )
        db.add(session)
        db.flush()
    retriever = RetrieverService(get_embedding_service())
    chunks = retriever.retrieve(db, question=payload.question, knowledge_base_id=kb.id, department_id=kb.department_id)
    prompt = build_prompt(payload.question, chunks)
    citations = [
        {
            "document_id": chunk.document_id,
            "document_name": chunk.document_name,
            "content_preview": chunk.content[:160],
            "chunk_id": chunk.chunk_id,
            "score": chunk.score,
        }
        for chunk in chunks
    ]

    async def events():
        answer = ""
        yield {
            "event": "metadata",
            "data": json.dumps(
                {"session_id": session.id, "citations": citations, "is_flow_question": is_flow_question(payload.question)},
                ensure_ascii=False,
            ),
        }
        async for token in stream_deepseek_answer(prompt):
            answer += token
            yield {"event": "delta", "data": token}
        db.add(
            ChatMessage(
                session_id=session.id,
                role=MessageRole.USER,
                content=payload.question,
                retrieved_chunks=None,
                tokens_used=None,
            )
        )
        db.add(
            ChatMessage(
                session_id=session.id,
                role=MessageRole.ASSISTANT,
                content=answer,
                retrieved_chunks=citations,
                tokens_used=None,
            )
        )
        session.title = session.title or payload.question[:60] or "新会话"
        db.commit()
        yield {"event": "done", "data": json.dumps({"session_id": session.id, "citations": citations}, ensure_ascii=False)}

    return EventSourceResponse(events())
