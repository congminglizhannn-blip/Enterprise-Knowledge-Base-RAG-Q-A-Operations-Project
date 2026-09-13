from pydantic import BaseModel
from datetime import datetime

from app.models.enums import DocumentStatus, DocumentType


class DocumentRead(BaseModel):
    id: str
    knowledge_base_id: str
    department_id: str
    file_name: str
    file_type: DocumentType
    file_path: str
    status: DocumentStatus
    chunk_count: int
    error_message: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentChunkPreview(BaseModel):
    id: str
    chunk_index: int
    content: str

    model_config = {"from_attributes": True}


class DocumentDetail(DocumentRead):
    chunks: list[DocumentChunkPreview]


class LinkImportRequest(BaseModel):
    knowledge_base_id: str
    url: str
