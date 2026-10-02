"""Persist normalized source markdown for parsed documents."""
from alembic import op
import sqlalchemy as sa

revision = "20260930_0501"
down_revision = "20260924_0402"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("documents", sa.Column("source_markdown", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("documents", "source_markdown")
