"""add knowledge base scope

Revision ID: 20260916_0201
Revises: 20260915_0106
Create Date: 2026-09-16
"""

from alembic import op
import sqlalchemy as sa


revision = "20260916_0201"
down_revision = "20260915_0106"
branch_labels = None
depends_on = None


def upgrade() -> None:
    scope_enum = sa.Enum("global", "organization", "department", name="knowledge_base_scope")
    scope_enum.create(op.get_bind(), checkfirst=True)
    op.add_column("knowledge_bases", sa.Column("scope", scope_enum, nullable=True))
    op.add_column("knowledge_bases", sa.Column("target_id", sa.String(length=36), nullable=True))
    op.execute("UPDATE knowledge_bases SET scope = 'department', target_id = department_id WHERE scope IS NULL")
    op.alter_column("knowledge_bases", "scope", nullable=False)
    op.create_index("ix_knowledge_bases_scope", "knowledge_bases", ["scope"])
    op.create_index("ix_knowledge_bases_target_id", "knowledge_bases", ["target_id"])


def downgrade() -> None:
    op.drop_index("ix_knowledge_bases_target_id", table_name="knowledge_bases")
    op.drop_index("ix_knowledge_bases_scope", table_name="knowledge_bases")
    op.drop_column("knowledge_bases", "target_id")
    op.drop_column("knowledge_bases", "scope")
    sa.Enum(name="knowledge_base_scope").drop(op.get_bind(), checkfirst=True)
