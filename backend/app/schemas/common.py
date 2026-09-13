from pydantic import BaseModel


class PageResult(BaseModel):
    total: int
    items: list


class MessageResponse(BaseModel):
    message: str
