"""add organization and department archive fields

Revision ID: 20260920_0301
Revises: 20260916_0202
Create Date: 2026-09-20
"""

from alembic import op
import sqlalchemy as sa


revision = "20260920_0301"
down_revision = "20260916_0202"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("organizations", sa.Column("is_archived", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("organizations", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_organizations_is_archived", "organizations", ["is_archived"])

    op.add_column("departments", sa.Column("is_archived", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("departments", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_departments_is_archived", "departments", ["is_archived"])


def downgrade() -> None:
    op.drop_index("ix_departments_is_archived", table_name="departments")
    op.drop_column("departments", "archived_at")
    op.drop_column("departments", "is_archived")

    op.drop_index("ix_organizations_is_archived", table_name="organizations")
    op.drop_column("organizations", "archived_at")
    op.drop_column("organizations", "is_archived")
    op.drop_column("organizations", "description")
