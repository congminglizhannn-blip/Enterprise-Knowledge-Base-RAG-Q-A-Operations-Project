"""initial schema

Revision ID: 20260907_0001
Revises:
Create Date: 2026-09-07
"""

from collections.abc import Sequence

import pgvector.sqlalchemy
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260907_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

uuid = postgresql.UUID(as_uuid=False)


def timestamps() -> list[sa.Column]:
    return [
        sa.Column("id", uuid, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    user_role = postgresql.ENUM("super_admin", "dept_admin", "user", name="user_role")
    document_type = postgresql.ENUM("pdf", "docx", "xlsx", "link", name="document_type")
    document_status = postgresql.ENUM("pending", "processing", "completed", "failed", name="document_status")
    message_role = postgresql.ENUM("user", "assistant", name="message_role")
    for enum in (user_role, document_type, document_status, message_role):
        enum.create(op.get_bind(), checkfirst=True)
    user_role_col = postgresql.ENUM("super_admin", "dept_admin", "user", name="user_role", create_type=False)
    document_type_col = postgresql.ENUM("pdf", "docx", "xlsx", "link", name="document_type", create_type=False)
    document_status_col = postgresql.ENUM("pending", "processing", "completed", "failed", name="document_status", create_type=False)
    message_role_col = postgresql.ENUM("user", "assistant", name="message_role", create_type=False)

    op.create_table("departments", sa.Column("name", sa.String(120), nullable=False), sa.Column("description", sa.Text()), *timestamps(), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_departments_name"), "departments", ["name"], unique=True)

    op.create_table("users", sa.Column("username", sa.String(80), nullable=False), sa.Column("email", sa.String(255)), sa.Column("hashed_password", sa.String(255), nullable=False), sa.Column("full_name", sa.String(120)), sa.Column("role", user_role_col, nullable=False), sa.Column("department_id", uuid, nullable=False), sa.Column("is_active", sa.Boolean(), nullable=False), *timestamps(), sa.ForeignKeyConstraint(["department_id"], ["departments.id"]), sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("email"))
    op.create_index(op.f("ix_users_department_id"), "users", ["department_id"])
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)

    op.create_table("knowledge_bases", sa.Column("name", sa.String(160), nullable=False), sa.Column("description", sa.Text()), sa.Column("department_id", uuid, nullable=False), sa.Column("created_by", uuid, nullable=False), *timestamps(), sa.ForeignKeyConstraint(["created_by"], ["users.id"]), sa.ForeignKeyConstraint(["department_id"], ["departments.id"]), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_knowledge_bases_created_by"), "knowledge_bases", ["created_by"])
    op.create_index(op.f("ix_knowledge_bases_department_id"), "knowledge_bases", ["department_id"])
    op.create_index(op.f("ix_knowledge_bases_name"), "knowledge_bases", ["name"])

    op.create_table("documents", sa.Column("knowledge_base_id", uuid, nullable=False), sa.Column("department_id", uuid, nullable=False), sa.Column("file_name", sa.String(255), nullable=False), sa.Column("file_type", document_type_col, nullable=False), sa.Column("file_path", sa.Text(), nullable=False), sa.Column("status", document_status_col, nullable=False), sa.Column("chunk_count", sa.Integer(), nullable=False), sa.Column("uploaded_by", uuid, nullable=False), sa.Column("error_message", sa.Text()), *timestamps(), sa.ForeignKeyConstraint(["department_id"], ["departments.id"]), sa.ForeignKeyConstraint(["knowledge_base_id"], ["knowledge_bases.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"]), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_documents_department_id"), "documents", ["department_id"])
    op.create_index(op.f("ix_documents_knowledge_base_id"), "documents", ["knowledge_base_id"])
    op.create_index(op.f("ix_documents_uploaded_by"), "documents", ["uploaded_by"])

    op.create_table("document_chunks", sa.Column("document_id", uuid, nullable=False), sa.Column("knowledge_base_id", uuid, nullable=False), sa.Column("department_id", uuid, nullable=False), sa.Column("chunk_index", sa.Integer(), nullable=False), sa.Column("content", sa.Text(), nullable=False), sa.Column("content_hash", sa.String(64), nullable=False), sa.Column("embedding", pgvector.sqlalchemy.Vector(dim=384)), sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False), sa.Column("source_type", sa.String(30), nullable=False), sa.Column("source_url", sa.Text()), sa.Column("page_number", sa.Integer()), *timestamps(), sa.ForeignKeyConstraint(["department_id"], ["departments.id"]), sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["knowledge_base_id"], ["knowledge_bases.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_document_chunks_content_hash"), "document_chunks", ["content_hash"])
    op.create_index(op.f("ix_document_chunks_department_id"), "document_chunks", ["department_id"])
    op.create_index(op.f("ix_document_chunks_document_id"), "document_chunks", ["document_id"])
    op.create_index(op.f("ix_document_chunks_knowledge_base_id"), "document_chunks", ["knowledge_base_id"])
    op.create_index("ix_document_chunks_embedding_hnsw", "document_chunks", ["embedding"], postgresql_using="hnsw", postgresql_with={"m": 16, "ef_construction": 64}, postgresql_ops={"embedding": "vector_cosine_ops"})

    op.create_table("chat_sessions", sa.Column("user_id", uuid, nullable=False), sa.Column("knowledge_base_id", uuid, nullable=False), sa.Column("department_id", uuid, nullable=False), sa.Column("title", sa.String(180), nullable=False), *timestamps(), sa.ForeignKeyConstraint(["department_id"], ["departments.id"]), sa.ForeignKeyConstraint(["knowledge_base_id"], ["knowledge_bases.id"]), sa.ForeignKeyConstraint(["user_id"], ["users.id"]), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_chat_sessions_department_id"), "chat_sessions", ["department_id"])
    op.create_index(op.f("ix_chat_sessions_knowledge_base_id"), "chat_sessions", ["knowledge_base_id"])
    op.create_index(op.f("ix_chat_sessions_user_id"), "chat_sessions", ["user_id"])

    op.create_table("chat_messages", sa.Column("session_id", uuid, nullable=False), sa.Column("role", message_role_col, nullable=False), sa.Column("content", sa.Text(), nullable=False), sa.Column("retrieved_chunks", postgresql.JSONB(astext_type=sa.Text())), sa.Column("tokens_used", sa.Integer()), *timestamps(), sa.ForeignKeyConstraint(["session_id"], ["chat_sessions.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_chat_messages_session_id"), "chat_messages", ["session_id"])

    op.create_table("api_usage_logs", sa.Column("user_id", uuid, nullable=False), sa.Column("action", sa.String(80), nullable=False), sa.Column("input_tokens", sa.Integer(), nullable=False), sa.Column("output_tokens", sa.Integer(), nullable=False), sa.Column("total_tokens", sa.Integer(), nullable=False), sa.Column("model_used", sa.String(120)), sa.Column("response_time_ms", sa.Integer()), sa.Column("status", sa.String(30), nullable=False), sa.Column("error_msg", sa.Text()), sa.Column("detail_json", postgresql.JSONB(astext_type=sa.Text())), *timestamps(), sa.ForeignKeyConstraint(["user_id"], ["users.id"]), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_api_usage_logs_action"), "api_usage_logs", ["action"])
    op.create_index(op.f("ix_api_usage_logs_user_id"), "api_usage_logs", ["user_id"])

    op.create_table("processes", sa.Column("name", sa.String(160), nullable=False), sa.Column("description", sa.Text()), sa.Column("department_id", uuid, nullable=False), sa.Column("knowledge_base_id", uuid), *timestamps(), sa.ForeignKeyConstraint(["department_id"], ["departments.id"]), sa.ForeignKeyConstraint(["knowledge_base_id"], ["knowledge_bases.id"]), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_processes_department_id"), "processes", ["department_id"])
    op.create_index(op.f("ix_processes_knowledge_base_id"), "processes", ["knowledge_base_id"])
    op.create_index(op.f("ix_processes_name"), "processes", ["name"])

    op.create_table("process_nodes", sa.Column("process_id", uuid, nullable=False), sa.Column("title", sa.String(120), nullable=False), sa.Column("description", sa.Text()), sa.Column("sort_order", sa.Integer(), nullable=False), *timestamps(), sa.ForeignKeyConstraint(["process_id"], ["processes.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_process_nodes_process_id"), "process_nodes", ["process_id"])

    op.create_table("process_edges", sa.Column("process_id", uuid, nullable=False), sa.Column("source_node_id", uuid, nullable=False), sa.Column("target_node_id", uuid, nullable=False), sa.Column("condition_text", sa.String(255)), sa.Column("is_required", sa.Boolean(), nullable=False), *timestamps(), sa.ForeignKeyConstraint(["process_id"], ["processes.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["source_node_id"], ["process_nodes.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["target_node_id"], ["process_nodes.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_process_edges_process_id"), "process_edges", ["process_id"])

    op.create_table("process_documents", sa.Column("process_node_id", uuid, nullable=False), sa.Column("document_id", uuid, nullable=False), *timestamps(), sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["process_node_id"], ["process_nodes.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_process_documents_document_id"), "process_documents", ["document_id"])
    op.create_index(op.f("ix_process_documents_process_node_id"), "process_documents", ["process_node_id"])

    op.create_table("process_node_chunks", sa.Column("process_node_id", uuid, nullable=False), sa.Column("chunk_id", uuid, nullable=False), *timestamps(), sa.ForeignKeyConstraint(["chunk_id"], ["document_chunks.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["process_node_id"], ["process_nodes.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_process_node_chunks_chunk_id"), "process_node_chunks", ["chunk_id"])
    op.create_index(op.f("ix_process_node_chunks_process_node_id"), "process_node_chunks", ["process_node_id"])


def downgrade() -> None:
    for table in ("process_node_chunks", "process_documents", "process_edges", "process_nodes", "processes", "api_usage_logs", "chat_messages", "chat_sessions", "document_chunks", "documents", "knowledge_bases", "users", "departments"):
        op.drop_table(table)
    for enum_name in ("message_role", "document_status", "document_type", "user_role"):
        postgresql.ENUM(name=enum_name).drop(op.get_bind(), checkfirst=True)
