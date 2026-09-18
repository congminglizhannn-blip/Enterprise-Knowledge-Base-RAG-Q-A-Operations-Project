"""backfill default organization

Revision ID: 20260915_0104
Revises: 20260915_0103
Create Date: 2026-09-15
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260915_0104"
down_revision: str | None = "20260915_0103"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO organizations (id, name)
        SELECT gen_random_uuid(), '默认组织'
        WHERE NOT EXISTS (
            SELECT 1 FROM organizations WHERE name = '默认组织'
        )
        """
    )
    op.execute(
        """
        UPDATE departments
        SET org_id = (SELECT id FROM organizations WHERE name = '默认组织' LIMIT 1)
        WHERE org_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE users u
        SET org_id = d.org_id
        FROM departments d
        WHERE u.department_id = d.id
          AND u.org_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE knowledge_bases kb
        SET org_id = d.org_id
        FROM departments d
        WHERE kb.department_id = d.id
          AND kb.org_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE documents doc
        SET org_id = kb.org_id
        FROM knowledge_bases kb
        WHERE doc.knowledge_base_id = kb.id
          AND doc.org_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE document_chunks chunk
        SET org_id = doc.org_id
        FROM documents doc
        WHERE chunk.document_id = doc.id
          AND chunk.org_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE chat_sessions cs
        SET org_id = kb.org_id
        FROM knowledge_bases kb
        WHERE cs.knowledge_base_id = kb.id
          AND cs.org_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE api_usage_logs log
        SET org_id = u.org_id
        FROM users u
        WHERE log.user_id = u.id
          AND log.org_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE processes p
        SET org_id = d.org_id
        FROM departments d
        WHERE p.department_id = d.id
          AND p.org_id IS NULL
        """
    )


def downgrade() -> None:
    op.execute("UPDATE processes SET org_id = NULL")
    op.execute("UPDATE api_usage_logs SET org_id = NULL")
    op.execute("UPDATE chat_sessions SET org_id = NULL")
    op.execute("UPDATE document_chunks SET org_id = NULL")
    op.execute("UPDATE documents SET org_id = NULL")
    op.execute("UPDATE knowledge_bases SET org_id = NULL")
    op.execute("UPDATE users SET org_id = NULL")
    op.execute("UPDATE departments SET org_id = NULL")
    op.execute(
        """
        DELETE FROM organizations
        WHERE name = '默认组织'
          AND NOT EXISTS (SELECT 1 FROM auth_sessions WHERE auth_sessions.org_id = organizations.id)
          AND NOT EXISTS (SELECT 1 FROM org_invites WHERE org_invites.org_id = organizations.id)
          AND NOT EXISTS (SELECT 1 FROM audit_logs WHERE audit_logs.org_id = organizations.id)
        """
    )
