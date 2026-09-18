"""add nullable org id columns

Revision ID: 20260915_0103
Revises: 20260915_0102
Create Date: 2026-09-15
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260915_0103"
down_revision: str | None = "20260915_0102"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

uuid = postgresql.UUID(as_uuid=False)


def upgrade() -> None:
    for table_name in (
        "departments",
        "users",
        "knowledge_bases",
        "documents",
        "document_chunks",
        "chat_sessions",
        "api_usage_logs",
        "processes",
    ):
        op.add_column(table_name, sa.Column("org_id", uuid, nullable=True))
        op.create_index(f"ix_{table_name}_org_id", table_name, ["org_id"])

    op.add_column(
        "users",
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index("ix_documents_kb_org", "documents", ["knowledge_base_id", "org_id"])
    op.create_index("ix_document_chunks_kb_org", "document_chunks", ["knowledge_base_id", "org_id"])
    op.create_index("ix_document_chunks_doc_org", "document_chunks", ["document_id", "org_id"])
    op.create_index("ix_chat_sessions_user_org", "chat_sessions", ["user_id", "org_id"])
    op.create_index("ix_knowledge_bases_department_org", "knowledge_bases", ["department_id", "org_id"])


def downgrade() -> None:
    op.drop_index("ix_knowledge_bases_department_org", table_name="knowledge_bases")
    op.drop_index("ix_chat_sessions_user_org", table_name="chat_sessions")
    op.drop_index("ix_document_chunks_doc_org", table_name="document_chunks")
    op.drop_index("ix_document_chunks_kb_org", table_name="document_chunks")
    op.drop_index("ix_documents_kb_org", table_name="documents")
    op.drop_column("users", "must_change_password")

    for table_name in reversed(
        (
            "departments",
            "users",
            "knowledge_bases",
            "documents",
            "document_chunks",
            "chat_sessions",
            "api_usage_logs",
            "processes",
        )
    ):
        op.drop_index(f"ix_{table_name}_org_id", table_name=table_name)
        op.drop_column(table_name, "org_id")
