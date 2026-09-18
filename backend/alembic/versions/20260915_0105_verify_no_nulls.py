"""verify no nullable org ids remain

Revision ID: 20260915_0105
Revises: 20260915_0104
Create Date: 2026-09-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from alembic import context

revision: str = "20260915_0105"
down_revision: str | None = "20260915_0104"
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
    if context.is_offline_mode():
        for table_name in TABLES_WITH_ORG_ID:
            op.execute(f"-- verify manually: SELECT COUNT(*) FROM {table_name} WHERE org_id IS NULL")
        return

    connection = op.get_bind()
    failures: list[str] = []

    for table_name in TABLES_WITH_ORG_ID:
        count = connection.execute(sa.text(f"SELECT COUNT(*) FROM {table_name} WHERE org_id IS NULL")).scalar_one()
        print(f"{table_name}_missing_org_id={count}")
        if count:
            failures.append(f"{table_name}: {count}")

    if failures:
        raise RuntimeError("org_id backfill is incomplete: " + ", ".join(failures))


def downgrade() -> None:
    pass
