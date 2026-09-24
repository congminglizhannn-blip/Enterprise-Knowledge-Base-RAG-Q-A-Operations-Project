import json

from fastapi import APIRouter, Depends
from sse_starlette.sse import EventSourceResponse
from sqlalchemy.orm import Session

from app.api.knowledge_bases import get_accessible_kb
from app.api.sessions import get_accessible_session
from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.chat import ChatRequest
from app.services.chat_service import build_prompt, is_flow_question, stream_deepseek_answer
from app.services.embedding import get_embedding_service
from app.services.retriever import RetrieverService
from app.services.session_history import prepare_session, save_round

router = APIRouter()


@router.post("/stream")
async def stream_chat(payload: ChatRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    kb = get_accessible_kb(db, payload.knowledge_base_id, current_user)
    previous = get_accessible_session(db, payload.session_id, current_user) if payload.session_id else None
    session = prepare_session(db, current_user, kb.id, payload.question[:60], previous)
    retriever = RetrieverService(get_embedding_service())
    chunks = retriever.retrieve(
        db,
        question=payload.question,
        knowledge_base_id=kb.id,
        scope=kb.scope,
        org_id=kb.org_id,
        department_id=kb.department_id,
    )
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
        save_round(db, session, payload.question, answer, citations)
        yield {"event": "done", "data": json.dumps({"session_id": session.id, "citations": citations}, ensure_ascii=False)}

    return EventSourceResponse(events())
