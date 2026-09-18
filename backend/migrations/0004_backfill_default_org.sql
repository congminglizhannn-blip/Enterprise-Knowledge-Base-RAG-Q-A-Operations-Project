-- Stage 1.4: create default organization and backfill existing demo data.
-- Draft only. Run the validation queries before adding NOT NULL constraints.

INSERT INTO organizations (id, name)
SELECT gen_random_uuid(), '默认组织'
WHERE NOT EXISTS (
    SELECT 1 FROM organizations WHERE name = '默认组织'
);

UPDATE departments
SET org_id = (SELECT id FROM organizations WHERE name = '默认组织' LIMIT 1)
WHERE org_id IS NULL;

UPDATE users u
SET org_id = d.org_id
FROM departments d
WHERE u.department_id = d.id
  AND u.org_id IS NULL;

UPDATE knowledge_bases kb
SET org_id = d.org_id
FROM departments d
WHERE kb.department_id = d.id
  AND kb.org_id IS NULL;

UPDATE documents doc
SET org_id = kb.org_id
FROM knowledge_bases kb
WHERE doc.knowledge_base_id = kb.id
  AND doc.org_id IS NULL;

UPDATE document_chunks chunk
SET org_id = doc.org_id
FROM documents doc
WHERE chunk.document_id = doc.id
  AND chunk.org_id IS NULL;

UPDATE chat_sessions cs
SET org_id = kb.org_id
FROM knowledge_bases kb
WHERE cs.knowledge_base_id = kb.id
  AND cs.org_id IS NULL;

UPDATE api_usage_logs log
SET org_id = u.org_id
FROM users u
WHERE log.user_id = u.id
  AND log.org_id IS NULL;

UPDATE processes p
SET org_id = d.org_id
FROM departments d
WHERE p.department_id = d.id
  AND p.org_id IS NULL;

SELECT COUNT(*) AS departments_missing_org_id FROM departments WHERE org_id IS NULL;
SELECT COUNT(*) AS users_missing_org_id FROM users WHERE org_id IS NULL;
SELECT COUNT(*) AS knowledge_bases_missing_org_id FROM knowledge_bases WHERE org_id IS NULL;
SELECT COUNT(*) AS documents_missing_org_id FROM documents WHERE org_id IS NULL;
SELECT COUNT(*) AS document_chunks_missing_org_id FROM document_chunks WHERE org_id IS NULL;
SELECT COUNT(*) AS chat_sessions_missing_org_id FROM chat_sessions WHERE org_id IS NULL;
SELECT COUNT(*) AS api_usage_logs_missing_org_id FROM api_usage_logs WHERE org_id IS NULL;
SELECT COUNT(*) AS processes_missing_org_id FROM processes WHERE org_id IS NULL;
