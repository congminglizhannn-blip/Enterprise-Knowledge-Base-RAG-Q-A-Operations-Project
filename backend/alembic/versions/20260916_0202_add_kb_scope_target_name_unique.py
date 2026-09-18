"""add kb scope target name unique index

Revision ID: 20260916_0202
Revises: 20260916_0201
Create Date: 2026-09-16
"""

from alembic import op


revision = "20260916_0202"
down_revision = "20260916_0201"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_scope_target_name
        ON knowledge_bases (scope, COALESCE(target_id, ''), name)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_kb_scope_target_name")
