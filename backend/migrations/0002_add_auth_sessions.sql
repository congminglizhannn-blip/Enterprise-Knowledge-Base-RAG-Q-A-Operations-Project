-- Stage 1.2: add auth_sessions table.
-- Draft only. Convert to Alembic and verify on a test database before running.

CREATE TABLE IF NOT EXISTS auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash CHAR(64) NOT NULL,
    csrf_token_hash CHAR(64) NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    absolute_expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NULL,
    user_agent TEXT NULL,
    ip INET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_auth_sessions_token_hash_sha256_hex CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_auth_sessions_csrf_token_hash_sha256_hex CHECK (
        csrf_token_hash IS NULL OR csrf_token_hash ~ '^[0-9a-f]{64}$'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_auth_sessions_token_hash ON auth_sessions (token_hash);
CREATE INDEX IF NOT EXISTS ix_auth_sessions_csrf_token_hash ON auth_sessions (csrf_token_hash);
CREATE INDEX IF NOT EXISTS ix_auth_sessions_user_id ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS ix_auth_sessions_org_id ON auth_sessions (org_id);
CREATE INDEX IF NOT EXISTS ix_auth_sessions_expires_at ON auth_sessions (expires_at);
CREATE INDEX IF NOT EXISTS ix_auth_sessions_absolute_expires_at ON auth_sessions (absolute_expires_at);
CREATE INDEX IF NOT EXISTS ix_auth_sessions_revoked_at ON auth_sessions (revoked_at);
CREATE INDEX IF NOT EXISTS ix_auth_sessions_active_user ON auth_sessions (user_id, expires_at)
WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_auth_sessions_active_org ON auth_sessions (org_id, expires_at)
WHERE revoked_at IS NULL;
