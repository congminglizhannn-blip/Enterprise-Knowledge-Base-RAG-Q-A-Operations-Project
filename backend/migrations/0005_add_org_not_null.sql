-- Stage 1.5: add NOT NULL and foreign key constraints after successful backfill.
-- Draft only. Execute only after every "*_missing_org_id" validation query returns 0.

ALTER TABLE departments
    ALTER COLUMN org_id SET NOT NULL,
    ADD CONSTRAINT fk_departments_org_id FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE users
    ALTER COLUMN org_id SET NOT NULL,
    ADD CONSTRAINT fk_users_org_id FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE knowledge_bases
    ALTER COLUMN org_id SET NOT NULL,
    ADD CONSTRAINT fk_knowledge_bases_org_id FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE documents
    ALTER COLUMN org_id SET NOT NULL,
    ADD CONSTRAINT fk_documents_org_id FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE document_chunks
    ALTER COLUMN org_id SET NOT NULL,
    ADD CONSTRAINT fk_document_chunks_org_id FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE chat_sessions
    ALTER COLUMN org_id SET NOT NULL,
    ADD CONSTRAINT fk_chat_sessions_org_id FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE api_usage_logs
    ALTER COLUMN org_id SET NOT NULL,
    ADD CONSTRAINT fk_api_usage_logs_org_id FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE processes
    ALTER COLUMN org_id SET NOT NULL,
    ADD CONSTRAINT fk_processes_org_id FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
