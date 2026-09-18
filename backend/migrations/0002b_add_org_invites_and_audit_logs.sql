-- Stage 1.2b: add invite and audit tables from the latest auth/org SQL draft.
-- Draft only. Models and API handlers are implemented in later stages.

CREATE TABLE IF NOT EXISTS org_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code_hash CHAR(64) NOT NULL,
    role user_role NOT NULL,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    used_at TIMESTAMPTZ NULL,
    revoked_at TIMESTAMPTZ NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_org_invites_code_hash_sha256_hex CHECK (code_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_org_invites_expiry_after_create CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_org_invites_code_hash ON org_invites (code_hash);
CREATE INDEX IF NOT EXISTS ix_org_invites_org_id ON org_invites (org_id);
CREATE INDEX IF NOT EXISTS ix_org_invites_department_id ON org_invites (department_id);
CREATE INDEX IF NOT EXISTS ix_org_invites_expires_at ON org_invites (expires_at);
CREATE INDEX IF NOT EXISTS ix_org_invites_used_by ON org_invites (used_by);
CREATE INDEX IF NOT EXISTS ix_org_invites_revoked_at ON org_invites (revoked_at);
CREATE INDEX IF NOT EXISTS ix_org_invites_active_org ON org_invites (org_id, expires_at)
WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NULL REFERENCES organizations(id) ON DELETE SET NULL,
    user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(120) NOT NULL,
    ip INET NULL,
    user_agent TEXT NULL,
    metadata_json JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_audit_logs_org_id ON audit_logs (org_id);
CREATE INDEX IF NOT EXISTS ix_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS ix_audit_logs_event_type ON audit_logs (event_type);
CREATE INDEX IF NOT EXISTS ix_audit_logs_created_at ON audit_logs (created_at);
