from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field


class HistoryQuery(BaseModel):
    keyword: str | None = Field(default=None, max_length=200)
    org_id: UUID | None = None
    dept_id: UUID | None = None
    kb_id: UUID | None = None
    user_id: UUID | None = None
    start_time: AwareDatetime | None = None
    end_time: AwareDatetime | None = None
    sort_by: Literal["updated_at", "round_count"] = "updated_at"
    sort_order: Literal["asc", "desc"] = "desc"
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class HistoryItem(BaseModel):
    id: str
    title: str
    user_id: str
    user_name: str
    org_id: str
    org_name: str
    dept_id: str
    dept_name: str
    kb_id: str
    kb_name: str
    round_count: int
    created_at: datetime
    updated_at: datetime


class HistoryPage(BaseModel):
    items: list[HistoryItem]
    total: int
    page: int
    page_size: int


class FilterOption(BaseModel):
    id: str
    name: str
    org_id: str | None = None
    department_id: str | None = None


class HistoryOptions(BaseModel):
    organizations: list[FilterOption]
    departments: list[FilterOption]
    knowledge_bases: list[FilterOption]
    users: list[FilterOption]
