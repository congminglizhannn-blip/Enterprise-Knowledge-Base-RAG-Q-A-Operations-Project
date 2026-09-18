-- Stage 1.3: add nullable org_id columns and supporting indexes.
-- Draft only. Convert to Alembic and verify on a test database before running.

ALTER TABLE departments ADD COLUMN IF NOT EXISTS org_id UUID NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id UUID NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE knowledge_bases ADD COLUMN IF NOT EXISTS org_id UUID NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS org_id UUID NULL;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS org_id UUID NULL;
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS org_id UUID NULL;
ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS org_id UUID NULL;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS org_id UUID NULL;

CREATE INDEX IF NOT EXISTS ix_departments_org_id ON departments (org_id);
CREATE INDEX IF NOT EXISTS ix_users_org_id ON users (org_id);
CREATE INDEX IF NOT EXISTS ix_knowledge_bases_org_id ON knowledge_bases (org_id);
CREATE INDEX IF NOT EXISTS ix_documents_org_id ON documents (org_id);
CREATE INDEX IF NOT EXISTS ix_document_chunks_org_id ON document_chunks (org_id);
CREATE INDEX IF NOT EXISTS ix_chat_sessions_org_id ON chat_sessions (org_id);
CREATE INDEX IF NOT EXISTS ix_api_usage_logs_org_id ON api_usage_logs (org_id);
CREATE INDEX IF NOT EXISTS ix_processes_org_id ON processes (org_id);

CREATE INDEX IF NOT EXISTS ix_documents_kb_org ON documents (knowledge_base_id, org_id);
CREATE INDEX IF NOT EXISTS ix_document_chunks_kb_org ON document_chunks (knowledge_base_id, org_id);
CREATE INDEX IF NOT EXISTS ix_document_chunks_doc_org ON document_chunks (document_id, org_id);
CREATE INDEX IF NOT EXISTS ix_chat_sessions_user_org ON chat_sessions (user_id, org_id);
CREATE INDEX IF NOT EXISTS ix_knowledge_bases_department_org ON knowledge_bases (department_id, org_id);
