from pydantic import BaseModel


class ProcessCreate(BaseModel):
    name: str
    description: str | None = None
    knowledge_base_id: str | None = None


class ProcessRead(BaseModel):
    id: str
    name: str
    description: str | None
    org_id: str
    department_id: str
    knowledge_base_id: str | None

    model_config = {"from_attributes": True}
