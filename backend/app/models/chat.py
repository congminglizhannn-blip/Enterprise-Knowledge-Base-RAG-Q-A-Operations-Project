from sqlalchemy import ForeignKey, Index, Integer, String, Text
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
    user_name_snapshot: Mapped[str | None] = mapped_column(String(120))
    round_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    __table_args__ = (
        Index("ix_chat_sessions_updated_at", "updated_at"),
        Index("ix_chat_sessions_dept_updated", "department_id", "updated_at"),
        Index("ix_chat_sessions_user_updated", "user_id", "updated_at"),
        Index("ix_chat_sessions_kb_updated", "knowledge_base_id", "updated_at"),
        Index("ix_chat_sessions_round_updated", "round_count", "updated_at"),
    )

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
