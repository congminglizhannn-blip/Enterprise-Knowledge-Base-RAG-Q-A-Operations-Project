"""Persist knowledge base enable/disable state without removing content."""
from alembic import op
import sqlalchemy as sa

revision = "20260924_0401"
down_revision = "20260920_0301"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("knowledge_bases", sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False))


def downgrade() -> None:
    op.drop_column("knowledge_bases", "is_active")
