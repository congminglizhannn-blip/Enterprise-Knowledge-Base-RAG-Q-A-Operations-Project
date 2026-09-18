"""create auth sessions and auth security tables

Revision ID: 20260915_0102
Revises: 20260915_0101
Create Date: 2026-09-15
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260915_0102"
down_revision: str | None = "20260915_0101"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

uuid = postgresql.UUID(as_uuid=False)
user_role = postgresql.ENUM("super_admin", "dept_admin", "user", name="user_role", create_type=False)


def upgrade() -> None:
    op.create_table(
        "auth_sessions",
        sa.Column("id", uuid, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("token_hash", sa.CHAR(64), nullable=False),
        sa.Column("csrf_token_hash", sa.CHAR(64), nullable=True),
        sa.Column("user_id", uuid, nullable=False),
        sa.Column("org_id", uuid, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("absolute_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("ip", postgresql.INET(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("token_hash ~ '^[0-9a-f]{64}$'", name="ck_auth_sessions_token_hash_sha256_hex"),
        sa.CheckConstraint(
            "csrf_token_hash IS NULL OR csrf_token_hash ~ '^[0-9a-f]{64}$'",
            name="ck_auth_sessions_csrf_token_hash_sha256_hex",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_auth_sessions_token_hash", "auth_sessions", ["token_hash"], unique=True)
    op.create_index("ix_auth_sessions_csrf_token_hash", "auth_sessions", ["csrf_token_hash"])
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_index("ix_auth_sessions_org_id", "auth_sessions", ["org_id"])
    op.create_index("ix_auth_sessions_expires_at", "auth_sessions", ["expires_at"])
    op.create_index("ix_auth_sessions_absolute_expires_at", "auth_sessions", ["absolute_expires_at"])
    op.create_index("ix_auth_sessions_revoked_at", "auth_sessions", ["revoked_at"])
    op.create_index(
        "ix_auth_sessions_active_user",
        "auth_sessions",
        ["user_id", "expires_at"],
        postgresql_where=sa.text("revoked_at IS NULL"),
    )
    op.create_index(
        "ix_auth_sessions_active_org",
        "auth_sessions",
        ["org_id", "expires_at"],
        postgresql_where=sa.text("revoked_at IS NULL"),
    )

    op.create_table(
        "org_invites",
        sa.Column("id", uuid, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", uuid, nullable=False),
        sa.Column("code_hash", sa.CHAR(64), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("department_id", uuid, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_by", uuid, nullable=True),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", uuid, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("code_hash ~ '^[0-9a-f]{64}$'", name="ck_org_invites_code_hash_sha256_hex"),
        sa.CheckConstraint("expires_at > created_at", name="ck_org_invites_expiry_after_create"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["used_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_org_invites_code_hash", "org_invites", ["code_hash"], unique=True)
    op.create_index("ix_org_invites_org_id", "org_invites", ["org_id"])
    op.create_index("ix_org_invites_department_id", "org_invites", ["department_id"])
    op.create_index("ix_org_invites_expires_at", "org_invites", ["expires_at"])
    op.create_index("ix_org_invites_used_by", "org_invites", ["used_by"])
    op.create_index("ix_org_invites_revoked_at", "org_invites", ["revoked_at"])
    op.create_index(
        "ix_org_invites_active_org",
        "org_invites",
        ["org_id", "expires_at"],
        postgresql_where=sa.text("used_at IS NULL AND revoked_at IS NULL"),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", uuid, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", uuid, nullable=True),
        sa.Column("user_id", uuid, nullable=True),
        sa.Column("event_type", sa.String(120), nullable=False),
        sa.Column("ip", postgresql.INET(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_logs_org_id", "audit_logs", ["org_id"])
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_event_type", "audit_logs", ["event_type"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_event_type", table_name="audit_logs")
    op.drop_index("ix_audit_logs_user_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_org_id", table_name="audit_logs")
    op.drop_table("audit_logs")

    op.drop_index("ix_org_invites_active_org", table_name="org_invites")
    op.drop_index("ix_org_invites_revoked_at", table_name="org_invites")
    op.drop_index("ix_org_invites_used_by", table_name="org_invites")
    op.drop_index("ix_org_invites_expires_at", table_name="org_invites")
    op.drop_index("ix_org_invites_department_id", table_name="org_invites")
    op.drop_index("ix_org_invites_org_id", table_name="org_invites")
    op.drop_index("ix_org_invites_code_hash", table_name="org_invites")
    op.drop_table("org_invites")

    op.drop_index("ix_auth_sessions_active_org", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_active_user", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_revoked_at", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_absolute_expires_at", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_expires_at", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_org_id", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_user_id", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_csrf_token_hash", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_token_hash", table_name="auth_sessions")
    op.drop_table("auth_sessions")
