from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class Process(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "processes"

    name: Mapped[str] = mapped_column(String(160), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    department_id: Mapped[str] = mapped_column(ForeignKey("departments.id"), index=True)
    knowledge_base_id: Mapped[str | None] = mapped_column(ForeignKey("knowledge_bases.id"), index=True)


class ProcessNode(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "process_nodes"

    process_id: Mapped[str] = mapped_column(ForeignKey("processes.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class ProcessEdge(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "process_edges"

    process_id: Mapped[str] = mapped_column(ForeignKey("processes.id", ondelete="CASCADE"), index=True)
    source_node_id: Mapped[str] = mapped_column(ForeignKey("process_nodes.id", ondelete="CASCADE"))
    target_node_id: Mapped[str] = mapped_column(ForeignKey("process_nodes.id", ondelete="CASCADE"))
    condition_text: Mapped[str | None] = mapped_column(String(255))
    is_required: Mapped[bool] = mapped_column(Boolean, default=True)


class ProcessDocument(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "process_documents"

    process_node_id: Mapped[str] = mapped_column(ForeignKey("process_nodes.id", ondelete="CASCADE"), index=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)


class ProcessNodeChunk(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "process_node_chunks"

    process_node_id: Mapped[str] = mapped_column(ForeignKey("process_nodes.id", ondelete="CASCADE"), index=True)
    chunk_id: Mapped[str] = mapped_column(ForeignKey("document_chunks.id", ondelete="CASCADE"), index=True)
