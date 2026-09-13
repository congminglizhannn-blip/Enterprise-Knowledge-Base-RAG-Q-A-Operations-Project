from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin
from app.models.enums import DocumentStatus, DocumentType
from app.models.types import value_enum


class Document(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "documents"

    knowledge_base_id: Mapped[str] = mapped_column(ForeignKey("knowledge_bases.id", ondelete="CASCADE"), index=True)
    department_id: Mapped[str] = mapped_column(ForeignKey("departments.id"), index=True)
    file_name: Mapped[str] = mapped_column(String(255))
    file_type: Mapped[DocumentType] = mapped_column(value_enum(DocumentType, "document_type"))
    file_path: Mapped[str] = mapped_column(Text)
    status: Mapped[DocumentStatus] = mapped_column(value_enum(DocumentStatus, "document_status"), default=DocumentStatus.PENDING)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_by: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    error_message: Mapped[str | None] = mapped_column(Text)

    knowledge_base = relationship("KnowledgeBase", back_populates="documents")
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")
