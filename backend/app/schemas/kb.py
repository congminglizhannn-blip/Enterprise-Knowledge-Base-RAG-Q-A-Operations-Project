from pydantic import BaseModel, StrictBool

from app.models.enums import KnowledgeBaseScope


class KnowledgeBaseCreate(BaseModel):
    org_id: str | None = None
    scope: KnowledgeBaseScope = KnowledgeBaseScope.DEPARTMENT
    target_id: str | None = None
    name: str
    description: str | None = None


class KnowledgeBaseUpdate(BaseModel):
    name: str
    description: str | None = None
    scope: KnowledgeBaseScope
    target_id: str | None = None
    org_id: str | None = None


class KnowledgeBaseStatusUpdate(BaseModel):
    is_active: StrictBool


class KnowledgeBaseRead(BaseModel):
    is_active: bool = True
    id: str
    name: str
    description: str | None
    scope: KnowledgeBaseScope
    target_id: str | None
    org_id: str
    department_id: str
    created_by: str
    org_name: str | None = None
    department_name: str | None = None
    target_name: str | None = None
    document_count: int = 0
    chunk_count: int = 0

    model_config = {"from_attributes": True}
