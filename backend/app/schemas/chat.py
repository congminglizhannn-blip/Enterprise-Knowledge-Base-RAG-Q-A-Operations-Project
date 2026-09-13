from pydantic import BaseModel


class ChatRequest(BaseModel):
    knowledge_base_id: str
    question: str
    session_id: str | None = None


class Citation(BaseModel):
    document_id: str | None = None
    document_name: str
    content_preview: str
    chunk_id: str | None = None
    score: float | None = None


class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation]
    mermaid: str | None = None
