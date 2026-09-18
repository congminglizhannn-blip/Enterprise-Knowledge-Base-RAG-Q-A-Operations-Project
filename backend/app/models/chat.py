from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin
from app.models.enums import MessageRole
from app.models.types import value_enum


class ChatSession(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "chat_sessions"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    knowledge_base_id: Mapped[str] = mapped_column(ForeignKey("knowledge_bases.id"), index=True)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    department_id: Mapped[str] = mapped_column(ForeignKey("departments.id"), index=True)
    title: Mapped[str] = mapped_column(String(180), default="新会话")

    organization = relationship("Organization")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")


class ChatMessage(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "chat_messages"

    session_id: Mapped[str] = mapped_column(ForeignKey("chat_sessions.id", ondelete="CASCADE"), index=True)
    role: Mapped[MessageRole] = mapped_column(value_enum(MessageRole, "message_role"))
    content: Mapped[str] = mapped_column(Text)
    retrieved_chunks: Mapped[list | None] = mapped_column(JSONB)
    tokens_used: Mapped[int | None] = mapped_column(Integer)

    session = relationship("ChatSession", back_populates="messages")
