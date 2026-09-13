from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class KnowledgeBase(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "knowledge_bases"

    name: Mapped[str] = mapped_column(String(160), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    department_id: Mapped[str] = mapped_column(ForeignKey("departments.id"), index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)

    department = relationship("Department", back_populates="knowledge_bases")
    documents = relationship("Document", back_populates="knowledge_base", cascade="all, delete-orphan")
