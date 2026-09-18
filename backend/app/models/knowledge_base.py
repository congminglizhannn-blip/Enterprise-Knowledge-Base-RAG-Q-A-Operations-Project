from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin
from app.models.enums import KnowledgeBaseScope
from app.models.types import value_enum


class KnowledgeBase(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "knowledge_bases"

    name: Mapped[str] = mapped_column(String(160), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    scope: Mapped[KnowledgeBaseScope] = mapped_column(value_enum(KnowledgeBaseScope, "knowledge_base_scope"), default=KnowledgeBaseScope.DEPARTMENT, index=True)
    target_id: Mapped[str | None] = mapped_column(String(36), index=True)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    department_id: Mapped[str] = mapped_column(ForeignKey("departments.id"), index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)

    organization = relationship("Organization", back_populates="knowledge_bases")
    department = relationship("Department", back_populates="knowledge_bases")
    documents = relationship("Document", back_populates="knowledge_base", cascade="all, delete-orphan")
