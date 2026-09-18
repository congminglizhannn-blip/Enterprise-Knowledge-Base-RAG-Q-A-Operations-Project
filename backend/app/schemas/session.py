from datetime import datetime

from pydantic import BaseModel

from app.models.enums import MessageRole


class ChatSessionCreate(BaseModel):
    knowledge_base_id: str
    title: str | None = None


class ChatSessionRead(BaseModel):
    id: str
    knowledge_base_id: str
    org_id: str
    department_id: str
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ChatMessageRead(BaseModel):
    id: str
    session_id: str
    role: MessageRole
    content: str
    retrieved_chunks: list | None = None
    tokens_used: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatSessionDetail(ChatSessionRead):
    messages: list[ChatMessageRead]
