-- 认证与组织模型迁移 SQL 草案
-- 说明：
-- 1. 本文件只作为迁移设计草案，不要直接在生产数据库执行。
-- 2. 真正落地时应转换为 Alembic migration，并先在测试库验证。
-- 3. 本草案采用“新增表 -> 加可空列 -> 回填 -> 加约束 -> 改代码 -> 清理”六阶段。
-- 4. UUID 生成函数按 gen_random_uuid() 编写；如果数据库未启用 pgcrypto，需要先启用扩展或改用应用层生成 UUID。

BEGIN;

-- ============================================================
-- 阶段一：新增表
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(160) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_organizations_name ON organizations (name);

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

-- ============================================================
-- 阶段二：加可空列
-- ============================================================

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

-- ============================================================
-- 阶段三：回填
-- ============================================================

-- 3.1 创建默认组织，用于承接现有演示数据。
INSERT INTO organizations (id, name)
SELECT gen_random_uuid(), '默认组织'
WHERE NOT EXISTS (
    SELECT 1 FROM organizations WHERE name = '默认组织'
);

-- 3.2 部门归属默认组织。
UPDATE departments
SET org_id = (SELECT id FROM organizations WHERE name = '默认组织' LIMIT 1)
WHERE org_id IS NULL;

-- 3.3 用户根据部门归属组织。
UPDATE users u
SET org_id = d.org_id
FROM departments d
WHERE u.department_id = d.id
  AND u.org_id IS NULL;

-- 3.4 知识库根据部门归属组织。
UPDATE knowledge_bases kb
SET org_id = d.org_id
FROM departments d
WHERE kb.department_id = d.id
  AND kb.org_id IS NULL;

-- 3.5 文档根据知识库归属组织，优先保持与 knowledge_bases 一致。
UPDATE documents doc
SET org_id = kb.org_id
FROM knowledge_bases kb
WHERE doc.knowledge_base_id = kb.id
  AND doc.org_id IS NULL;

-- 3.6 Chunk 根据文档归属组织。
UPDATE document_chunks chunk
SET org_id = doc.org_id
FROM documents doc
WHERE chunk.document_id = doc.id
  AND chunk.org_id IS NULL;

-- 3.7 问答会话根据知识库归属组织。
UPDATE chat_sessions cs
SET org_id = kb.org_id
FROM knowledge_bases kb
WHERE cs.knowledge_base_id = kb.id
  AND cs.org_id IS NULL;

-- 3.8 API 使用日志根据用户归属组织。
UPDATE api_usage_logs log
SET org_id = u.org_id
FROM users u
WHERE log.user_id = u.id
  AND log.org_id IS NULL;

-- 3.9 流程根据部门归属组织。
UPDATE processes p
SET org_id = d.org_id
FROM departments d
WHERE p.department_id = d.id
  AND p.org_id IS NULL;

-- 3.10 回填校验。以下查询应全部返回 0。
SELECT COUNT(*) AS departments_missing_org_id FROM departments WHERE org_id IS NULL;
SELECT COUNT(*) AS users_missing_org_id FROM users WHERE org_id IS NULL;
SELECT COUNT(*) AS knowledge_bases_missing_org_id FROM knowledge_bases WHERE org_id IS NULL;
SELECT COUNT(*) AS documents_missing_org_id FROM documents WHERE org_id IS NULL;
SELECT COUNT(*) AS document_chunks_missing_org_id FROM document_chunks WHERE org_id IS NULL;
SELECT COUNT(*) AS chat_sessions_missing_org_id FROM chat_sessions WHERE org_id IS NULL;
SELECT COUNT(*) AS api_usage_logs_missing_org_id FROM api_usage_logs WHERE org_id IS NULL;
SELECT COUNT(*) AS processes_missing_org_id FROM processes WHERE org_id IS NULL;

-- ============================================================
-- 阶段四：加约束
-- ============================================================

-- 注意：只有阶段三校验全部为 0 后，才允许执行本阶段。

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

-- 可选一致性约束建议：
-- PostgreSQL 无法用普通 CHECK 约束跨表校验 org_id 一致性。
-- 如需强一致，可在代码层校验，或后续增加触发器/复合外键。
-- 例如 documents.org_id 应等于 knowledge_bases.org_id；
-- document_chunks.org_id 应等于 documents.org_id；
-- chat_sessions.org_id 应等于 users.org_id 和 knowledge_bases.org_id。

-- ============================================================
-- 阶段五：改代码
-- ============================================================

-- 本阶段不执行 SQL，只记录代码改动顺序。
-- 5.1 新增 SQLAlchemy 模型：Organization、AuthSession、OrgInvite、AuditLog。
-- 5.2 AuthSession 存 token_hash 和 csrf_token_hash，不存 cookie 原始 token；cookie 名统一使用 session_token。
-- 5.3 随机 token 使用 256-bit 以上密码学随机数，例如 secrets.token_urlsafe(32)；token_hash 使用 SHA-256。
-- 5.4 邀请码使用 secrets.token_urlsafe(16) 或等价高熵随机值；code_hash 使用 SHA-256；不要使用 6 位数字短码。
-- 5.5 调整 Department/User/KnowledgeBase/Document/DocumentChunk/ChatSession/ApiUsageLog/Process 模型，加入 org_id；User 增加 must_change_password。
-- 5.6 调整 schema 返回 org_id 和 must_change_password；/api/auth/me 和 register 返回 { user, org, department }。
-- 5.7 新增 POST /api/auth/register：支持创建新组织或使用一次性邀请码加入；注册成功后创建 auth_session 并 Set-Cookie，实现自动登录。
-- 5.8 register 错误码必须可区分：ORG_NAME_TAKEN、USERNAME_TAKEN、EMAIL_TAKEN、INVITE_INVALID、INVITE_USED、INVITE_EXPIRED、INVITE_REVOKED、PASSWORD_TOO_WEAK、RATE_LIMITED。
-- 5.9 修改 POST /api/auth/login：创建 auth_sessions，Set-Cookie: session_token；如果 users.must_change_password = true，仍允许登录并在响应体返回该状态。
-- 5.10 新增 POST /api/auth/logout：接口必须幂等；session 不存在、已过期或已撤销仍返回 200 并清除 cookie；只有 CSRF 校验失败才返回 403。
-- 5.11 新增 GET /api/auth/csrf：已登录后下发 CSRF token，并把 SHA-256 写入 auth_sessions.csrf_token_hash；未登录返回 401。
-- 5.12 新增 POST /api/auth/change-password：校验 session cookie 和 X-CSRF-Token；成功后 must_change_password=false，撤销其他 session，并重新签发当前 session_token。
-- 5.13 修改 GET /api/auth/me：优先读取 cookie session，兼容期保留 Bearer Token；旧 JWT 通过 sub 反查 users.org_id。
-- 5.14 新增 POST/GET/DELETE /api/auth/invites，当前组织 super_admin 管理一次性邀请码。
-- 5.15 新增 GET /api/auth/invites/validate：注册页预校验邀请码；限流；不返回 code_hash、创建人等敏感字段。
-- 5.16 新增 POST /api/admin/users/{id}/reset-password：仅 super_admin 可重置本组织用户；设置 must_change_password=true，并撤销该用户全部有效 session。
-- 5.17 POST /api/auth/logout-all 本期延后；如必须上线，权限范围仅限当前用户自己的全部 session。
-- 5.18 新增 session 生命周期：滑动过期 24 小时、绝对过期 7 天、单用户最多 5 个活跃 session；仅剩余不足 1 小时时续期，避免写放大。
-- 5.19 所有知识库、文档、上传、解析、问答、历史、流程、审计查询增加 org_id 过滤。
-- 5.20 RAG 检索增加 org_id 条件；外部向量库必须将 org_id 作为 metadata filter 前置传入。
-- 5.21 前端 fetch 增加 credentials: "include"，登出调用服务端 logout；logout 调用方无论成功失败都清理本地状态并跳登录。
-- 5.22 前端 401 由 AuthContext/AuthGate 统一处理；apiClient 只抛 ApiError 和通知状态，不直接 router.replace；SSE 401 主动关闭并提示。
-- 5.23 写操作必须携带 X-CSRF-Token；POST /api/auth/logout 豁免 CSRF 自动重放，POST /api/auth/change-password 必须纳入一次 CSRF 重取与重放机制。
-- 5.24 前端 route guard 只负责 UX；后端接口必须继续做认证、org_id 和角色校验。
-- 5.25 增加跨组织隔离测试、同组织跨部门隔离测试、CSRF 写操作测试、邀请码权限测试、强制改密测试。

-- ============================================================
-- 阶段六：清理
-- ============================================================

-- 只有 cookie session 认证稳定、前后端联调通过后，才考虑执行清理。

-- 6.1 可选：废弃 /api/auth/refresh。
-- 6.2 可选：移除前端 localStorage 中 auth_token/refresh_token 使用。
-- 6.3 移除后端 Bearer Token 兼容分支前，先通过审计日志统计 Bearer Token 请求量。
-- 6.4 如仍有移动端、CLI、脚本或第三方集成依赖 token，改为 Personal Access Token 或保留只读 Bearer 路径。
-- 6.5 增加定时任务：每小时清理 expires_at < now() 的 session；revoked_at 记录保留 30 天后归档或删除。
-- 6.6 可选：为 auth_sessions 增加设备标识、登录地点、最后活跃时间等字段。
-- 6.7 audit_logs 默认保留 180 天；企业合规部署可保留 1 年并按 created_at 月度分区。

COMMIT;

-- ============================================================
-- 回滚草案
-- ============================================================

-- 如果只执行到阶段二或阶段三，回滚相对简单：
-- ALTER TABLE processes DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE api_usage_logs DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE chat_sessions DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE document_chunks DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE documents DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE knowledge_bases DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE users DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE users DROP COLUMN IF EXISTS must_change_password;
-- ALTER TABLE departments DROP COLUMN IF EXISTS org_id;
-- DROP TABLE IF EXISTS auth_sessions;
-- DROP TABLE IF EXISTS org_invites;
-- DROP TABLE IF EXISTS audit_logs;
-- DROP TABLE IF EXISTS organizations;

-- 如果已经执行阶段四，需要先删除外键约束再删除列：
-- ALTER TABLE processes DROP CONSTRAINT IF EXISTS fk_processes_org_id;
-- ALTER TABLE api_usage_logs DROP CONSTRAINT IF EXISTS fk_api_usage_logs_org_id;
-- ALTER TABLE chat_sessions DROP CONSTRAINT IF EXISTS fk_chat_sessions_org_id;
-- ALTER TABLE document_chunks DROP CONSTRAINT IF EXISTS fk_document_chunks_org_id;
-- ALTER TABLE documents DROP CONSTRAINT IF EXISTS fk_documents_org_id;
-- ALTER TABLE knowledge_bases DROP CONSTRAINT IF EXISTS fk_knowledge_bases_org_id;
-- ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_org_id;
-- ALTER TABLE departments DROP CONSTRAINT IF EXISTS fk_departments_org_id;
