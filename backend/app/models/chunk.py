from pgvector.sqlalchemy import Vector
from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class DocumentChunk(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "document_chunks"

    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    knowledge_base_id: Mapped[str] = mapped_column(ForeignKey("knowledge_bases.id", ondelete="CASCADE"), index=True)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    department_id: Mapped[str] = mapped_column(ForeignKey("departments.id"), index=True)
    chunk_index: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64), index=True)
    embedding = mapped_column(Vector(settings.embedding_dimension))
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    source_type: Mapped[str] = mapped_column(String(30))
    source_url: Mapped[str | None] = mapped_column(Text)
    page_number: Mapped[int | None] = mapped_column(Integer)

    organization = relationship("Organization")
    document = relationship("Document", back_populates="chunks")
