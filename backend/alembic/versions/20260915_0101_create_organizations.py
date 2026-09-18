"""create organizations

Revision ID: 20260915_0101
Revises: 20260907_0001
Create Date: 2026-09-15
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260915_0101"
down_revision: str | None = "20260907_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

uuid = postgresql.UUID(as_uuid=False)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.create_table(
        "organizations",
        sa.Column("id", uuid, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_organizations_name", "organizations", ["name"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_organizations_name", table_name="organizations")
    op.drop_table("organizations")
