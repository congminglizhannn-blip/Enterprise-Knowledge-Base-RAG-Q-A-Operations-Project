"""History ownership snapshots, persisted rounds and department hierarchy."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260924_0402"
down_revision = "20260924_0401"
branch_labels = None
depends_on = None

INDEXES = {
    "ix_chat_sessions_updated_at": ["updated_at"],
    "ix_chat_sessions_dept_updated": ["department_id", "updated_at"],
    "ix_chat_sessions_user_updated": ["user_id", "updated_at"],
    "ix_chat_sessions_kb_updated": ["knowledge_base_id", "updated_at"],
    "ix_chat_sessions_round_updated": ["round_count", "updated_at"],
}


def upgrade():
    op.add_column("departments", sa.Column("parent_id", postgresql.UUID(as_uuid=False), nullable=True))
    op.create_foreign_key("fk_departments_parent", "departments", "departments", ["parent_id"], ["id"])
    op.create_index("ix_departments_parent_id", "departments", ["parent_id"])
    op.add_column("chat_sessions", sa.Column("user_name_snapshot", sa.String(120), nullable=True))
    op.add_column("chat_sessions", sa.Column("round_count", sa.Integer(), server_default="0", nullable=False))
    # Old ownership was copied from the KB, not the author. Historical transfers
    # cannot be reconstructed: use the author's current membership once only.
    op.execute("""UPDATE chat_sessions s SET org_id=u.org_id, department_id=u.department_id,
        user_name_snapshot=COALESCE(NULLIF(u.full_name, ''), u.username)
        FROM users u WHERE u.id=s.user_id""")
    op.execute("""UPDATE chat_sessions s SET round_count=(SELECT COUNT(*) FROM chat_messages m
        WHERE m.session_id=s.id AND m.role='assistant')""")
    op.execute("""UPDATE chat_sessions s SET updated_at=GREATEST(s.updated_at,
        COALESCE((SELECT MAX(m.created_at) FROM chat_messages m WHERE m.session_id=s.id), s.updated_at))""")
    for name, columns in INDEXES.items():
        op.create_index(name, "chat_sessions", columns)


def downgrade():
    for name in reversed(INDEXES):
        op.drop_index(name, table_name="chat_sessions")
    op.drop_column("chat_sessions", "round_count")
    op.drop_column("chat_sessions", "user_name_snapshot")
    op.drop_index("ix_departments_parent_id", table_name="departments")
    op.drop_constraint("fk_departments_parent", "departments", type_="foreignkey")
    op.drop_column("departments", "parent_id")
