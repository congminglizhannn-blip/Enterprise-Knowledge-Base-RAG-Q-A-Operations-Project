from pydantic import BaseModel


class KnowledgeBaseCreate(BaseModel):
    name: str
    description: str | None = None


class KnowledgeBaseRead(BaseModel):
    id: str
    name: str
    description: str | None
    department_id: str
    created_by: str

    model_config = {"from_attributes": True}
