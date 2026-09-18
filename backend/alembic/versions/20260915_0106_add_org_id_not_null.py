"""add org id not null constraints

Revision ID: 20260915_0106
Revises: 20260915_0105
Create Date: 2026-09-15
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260915_0106"
down_revision: str | None = "20260915_0105"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES_WITH_ORG_ID = (
    "departments",
    "users",
    "knowledge_bases",
    "documents",
    "document_chunks",
    "chat_sessions",
    "api_usage_logs",
    "processes",
)


def upgrade() -> None:
    for table_name in TABLES_WITH_ORG_ID:
        op.alter_column(table_name, "org_id", nullable=False)
        op.create_foreign_key(
            f"fk_{table_name}_org_id",
            table_name,
            "organizations",
            ["org_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    for table_name in reversed(TABLES_WITH_ORG_ID):
        op.drop_constraint(f"fk_{table_name}_org_id", table_name, type_="foreignkey")
        op.alter_column(table_name, "org_id", nullable=True)
