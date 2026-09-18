# 认证与组织模型迁移设计

## 1. 背景与目标

当前项目已经可以完成文件上传、文档解析、向量化入库、DeepSeek 调用和简单 RAG 问答。现有权限隔离主要依赖 `department_id`，认证主要依赖 Access Token / Refresh Token 双 JWT，并由前端保存到 `localStorage`。

下一阶段目标是把系统从“作品集可演示”升级到更接近企业知识库平台的认证与组织模型：

- 引入 `organizations` 作为组织级租户边界。
- 保留 `departments` 作为组织下的部门边界。
- 引入服务端 `auth_sessions`，通过 `httpOnly cookie` 承载登录会话。
- 注册、登录、登出、刷新登录态形成完整闭环。
- RAG 上传、文档、chunk、问答历史、审计日志全部绑定 `org_id`。
- 防止 A 组织或 A 用户检索到 B 组织 / B 用户无权限文档。

本设计文档只描述方案和影响范围，不直接修改代码，不执行数据库迁移。

## 2. 概念定义

### 2.0 认证链路概念澄清

注册、登录、session 和 cookie 不矛盾，它们是同一条认证链路上的不同环节：

```text
注册 = 创建用户身份
登录 = 校验用户身份
auth_session = 登录成功后的服务端状态
cookie = 浏览器保存 session token 的载体
chat_session = 用户进入问答后的业务会话
```

因此 `auth_session` 解决“这个浏览器是否已登录”，`chat_session` 解决“这轮问答属于哪个会话”。两者名字相近，但职责完全不同。

### 2.1 Organization

`organization` 是企业、单位或租户级边界。它是数据隔离的第一层。企业知识库场景中，组织之间默认强隔离。

建议表名：`organizations`

核心字段：

- `id`
- `name`
- `created_at`
- `updated_at`

### 2.2 Department

`department` 是组织下的部门或业务单元。它是数据隔离的第二层。

当前系统已有 `departments` 表，但尚未归属到组织。迁移后应新增 `departments.org_id`。

### 2.3 User

`user` 是系统登录主体。当前系统已有 `users` 表，字段包括 `username`、`email`、`hashed_password`、`full_name`、`role`、`department_id`、`is_active`。

迁移后建议新增：

- `org_id`
- `must_change_password`
- 保留 `department_id`
- 保留 `role`
- 继续使用密码哈希字段 `hashed_password`

字段命名说明：用户最初提出 `password_hash`、`name`，现有代码使用 `hashed_password`、`full_name`。为减少改动和迁移风险，建议暂时沿用现有字段名，不做无收益重命名。

### 2.4 Auth Session

`auth_session` 是登录态服务端记录，和问答会话 `chat_sessions` 区分。

建议表名：`auth_sessions`，不建议叫 `sessions`，避免和已有 `chat_sessions` 混淆。

核心字段：

- `id`
- `token_hash`
- `csrf_token_hash`
- `user_id`
- `org_id`
- `expires_at`
- `absolute_expires_at`
- `revoked_at`
- `created_at`
- `updated_at`
- `user_agent`
- `ip`

安全约束：

- Cookie 中不存 `auth_sessions.id`，也不存任何数据库主键。
- Cookie 中只存 256-bit 以上的密码学随机 session token，例如 Python `secrets.token_urlsafe(32)` 生成的原始值。
- 数据库只保存该随机 token 的哈希值 `token_hash`，不保存明文 token。
- 校验时对 cookie 中的原始 token 做哈希，再用 `token_hash` 查表。
- `token_hash` 使用 SHA-256。session token 本身是高熵随机值，不存在常规密码字典攻击，因此不使用 bcrypt/argon2 等慢哈希，避免每次请求都产生不必要的认证开销。
- `token_hash` 可存 64 位 hex 字符串，或存 32 字节 `bytea`；本项目草案先采用 64 位 hex 字符串并加唯一索引。
- 这样即使数据库泄露，攻击者也不能直接拿表里的值伪造 cookie。

说明：UUID v4 的随机性并不低，但把可用于认证的数据库标识直接暴露给浏览器不是成熟设计；认证凭据应与数据库主键解耦。

### 2.5 Chat Session

`chat_session` 是问答会话，不是认证会话。当前已有 `chat_sessions` 表，迁移后需要新增 `org_id`，用于组织级历史隔离。

### 2.6 Knowledge Base / Document / Chunk

知识库、文档和 chunk 是 RAG 数据链路核心。迁移后必须全部显式携带 `org_id`：

- `knowledge_bases.org_id`
- `documents.org_id`
- `document_chunks.org_id`

只依赖 `department_id` 不够稳，因为组织级隔离应该是所有业务查询的第一过滤条件。

## 3. 认证选型

### 3.1 推荐方案

推荐使用：服务端 Session + `httpOnly cookie`。

原因：

- 企业知识库需要随时撤销登录态。
- 用户离职、停用、角色变更后，权限应尽快生效。
- 服务端 session 方便审计登录设备、IP、过期时间和主动登出。
- Refresh Token 放在 `localStorage` 有 XSS 泄露风险，不适合作为上线方案。

### 3.2 当前方案与迁移关系

当前系统已实现：

- Access Token：默认 24 小时。
- Refresh Token：默认 7 天。
- 前端遇到 401 后先刷新，再重试。
- token 存储在 `localStorage`。

该方案适合本地演示，但不建议上线。迁移时不应立刻删除 JWT，建议做兼容期：

```text
阶段 1：新增 organizations/auth_sessions 和 org_id 字段，不改变现有业务行为
阶段 2：登录接口同时创建 auth_session，并 Set-Cookie: session_token
阶段 3：认证依赖优先读取 cookie session，缺失时兼容 Bearer Token
阶段 4：前端请求启用 credentials: include，减少对 localStorage token 的依赖
阶段 5：确认稳定后移除 Refresh Token / localStorage 认证路径
```

### 3.3 Cookie 建议

本地开发：

```text
Set-Cookie: session_token=<random-token>; HttpOnly; SameSite=Lax; Path=/
```

生产环境：

```text
Set-Cookie: session_token=<random-token>; HttpOnly; Secure; SameSite=Lax; Path=/
```

写操作需要考虑 CSRF。`SameSite=Lax` 只能降低部分跨站请求风险，不能作为长期唯一防护，尤其不能覆盖同站子域攻击、浏览器兼容差异和复杂跳转场景。上线前必须增加 CSRF Token 机制。

本项目统一采用 synchronizer token pattern：

- 服务端生成 `csrf_token`。
- 通过 `GET /api/auth/csrf` 下发，不采用 double-submit cookie 作为本期方案。
- 前端把 CSRF token 存在内存中，不写入 `localStorage`。
- 前端写操作携带 `X-CSRF-Token`。
- 后端把 CSRF token 做 SHA-256 后写入 `auth_sessions.csrf_token_hash`，校验时同时验证 session cookie 与 CSRF token。
- `GET /api/auth/csrf` 本身不需要 CSRF。
- 登录、注册接口处于未认证状态，本期豁免 CSRF，依赖 `SameSite=Lax`、登录/注册限流和账号安全策略。
- 已登录后的改密、登出、文档上传、解析、删除、知识库管理等写操作必须校验 CSRF。
- 过渡期至少要求写操作携带自定义 header，例如 `X-Requested-With: XMLHttpRequest`，降低简单跨站表单提交风险。

### 3.4 Session 生命周期

认证会话采用“滑动过期 + 绝对过期”的组合：

- 滑动过期：有效请求可把 `expires_at` 顺延 24 小时。
- 为避免写放大，不应每次请求都更新 `auth_sessions`。仅当 `expires_at - now() < 1 hour` 时才刷新 `expires_at`，并把 `updated_at` 与 `expires_at` 合并在同一条 `UPDATE` 中。
- 绝对过期：`absolute_expires_at` 固定为创建后 7 天，滑动续期不能超过绝对过期时间。
- 单用户活跃 session 上限：MVP 建议 5 个，超过后撤销最旧的有效 session。
- 清理策略：每小时清理 `expires_at < now()` 的过期 session；`revoked_at IS NOT NULL` 的记录保留 30 天用于审计，之后可归档或删除。
- 权限变更策略：用户停用、角色变更、组织/部门变更时，应撤销该用户全部有效 session，确保权限即时生效。
- 用户主动改密：撤销该用户其他有效 session，并重新签发当前 session，避免改密成功后强制重新登录。
- 管理员重置密码：撤销该用户全部有效 session，并设置 `must_change_password = true`，用户需用临时密码重新登录后强制改密。

### 3.5 登录安全基础项

- 密码哈希：继续使用现有 `passlib` bcrypt；上线前可评估迁移到 argon2id。
- 密码强度：注册和改密时最小 8 位，建议包含字母和数字；演示环境可宽松，生产环境必须严格。
- 登录速率限制：按 IP + username/email 组合限流，防暴力破解。
- 注册速率限制：按 IP 限流，防止批量创建组织和用户。
- 验证码/Turnstile：本期按内网或本地演示部署假设，暂不接入图形验证码或 Turnstile；如果开放公网注册，必须补充验证码或等价的人机校验。
- 邮箱验证：本期暂不强制邮箱验证；如果启用自助注册并对外开放，必须增加邮箱验证后再允许登录或创建组织。
- 登录失败审计：记录登录失败、账号不存在、密码错误、账号停用等事件。
- 账号锁定：连续失败达到阈值后临时锁定，例如 10 分钟内失败 5 次锁定 15 分钟。
- 密码重哈希：当密码算法或参数升级时，在用户下次成功登录后静默重哈希。

### 3.6 多组织边界

本期明确不支持一个用户同时属于多个组织，也不支持前端组织切换。

本期采用：

- `users.org_id` 为单值。
- `auth_sessions.org_id` 固定为登录用户所属组织。
- 所有业务接口使用当前 session/user 的单一 `org_id`。

未来如需支持多组织用户，应新增 `memberships` 表，并把 session 中的组织字段改为 `active_org_id`：

```text
users
memberships(user_id, org_id, role, department_id)
auth_sessions(active_org_id)
```

### 3.7 Cookie 与部署形态

本地开发通常是前端 `http://127.0.0.1:3000`，后端 `http://127.0.0.1:8000`。同一 host 不同端口下 cookie 不按端口隔离，但跨端口请求仍需要：

- 前端 fetch 设置 `credentials: "include"`。
- 后端 CORS `Access-Control-Allow-Origin` 必须是具体 origin，不能是 `*`。
- 后端 CORS 需要允许 credentials。

生产推荐同站同域部署，例如：

```text
https://app.example.com
https://app.example.com/api
```

或由前端域名通过反向代理转发 `/api` 到后端。这样 cookie、CSRF 和 SameSite 策略最清晰。多子域部署时再考虑 `Domain=.example.com`，默认不要设置 `Domain`。

### 3.8 前端 401 处理策略

- `apiClient` 统一拦截 401。
- `POST /api/auth/login`、`POST /api/auth/register`、`GET /api/auth/csrf`、`GET /api/auth/invites/validate` 的 401 由调用方自行处理，不触发全局跳转。
- AuthContext 初始化调用 `GET /api/auth/me` 时传 `skipAuthRedirect: true`，apiClient 不做全局跳转；AuthContext 根据返回结果设置 `authenticated` 或 `unauthenticated`。
- 其他受保护接口返回 401 时，前端清除用户状态和内存态认证信息，跳转到 `/login?redirect=<当前路径>`，登录后回到原页面。
- SSE 流式请求如果收到 401 或连接中断，应主动关闭 reader/connection，并在对话区提示“登录态已失效，请重新登录”。
- `GET /api/auth/me` 返回结构统一为 `{ user, org, department }`，不要只依赖平铺的 `org_id`。
- 前端 AuthGate 只改善体验；后端接口仍必须做认证、`org_id` 过滤和角色校验。

### 3.9 兼容期 Token 返回策略

cookie session 迁移期间，后端可以通过 feature flag 控制是否继续返回 `access_token` / `refresh_token`。

- 新版 Web 前端不再把 token 写入 `localStorage`。
- 如果确需兼容旧客户端、CLI 或脚本，token 只面向这些客户端保留。
- 阶段 6 删除 Bearer Token 兼容前，必须先通过审计日志统计仍在使用 Bearer 的请求量。
- 如果仍有移动端、CLI、脚本或第三方集成，应改为 Personal Access Token，而不是继续复用 Web 登录 token。

## 4. 权限矩阵

角色沿用现有枚举：

- `super_admin`
- `dept_admin`
- `user`

建议权限矩阵：

| 能力 | super_admin | dept_admin | user |
|---|---|---|---|
| 查看当前组织知识库 | 是 | 仅本部门 | 仅授权/本部门 |
| 创建知识库 | 是 | 本部门 | 否 |
| 上传文档 | 是 | 本部门 | 视产品策略，可允许本部门 |
| 解析文档 | 是 | 本部门 | 视产品策略，建议仅管理员 |
| 删除文档 | 是 | 本部门 | 否 |
| RAG 问答 | 当前组织 | 本部门/授权知识库 | 本部门/授权知识库 |
| 查看引用来源 | 当前组织 | 本部门 | 本部门/授权知识库 |
| 查看问答历史 | 当前组织，可审计 | 本人或本部门，按需求定 | 仅本人 |
| 用户管理 | 当前组织 | 本部门用户 | 否 |
| 部门管理 | 当前组织 | 否或受限 | 否 |
| 认证会话管理 | 当前组织 | 本人/本部门，按需求定 | 仅本人 |

关键规则：

- 所有业务查询先过滤 `org_id`。
- 部门权限在 `org_id` 过滤之后再判断。
- `super_admin` 默认建议是组织内超级管理员，不建议默认拥有跨组织权限。
- 如果未来需要平台级管理员，应新增 `platform_admin` 或 `is_platform_admin`，不要混用组织内 `super_admin`。

## 5. 接口契约

### 5.1 POST /api/auth/register

用途：注册用户并创建新组织，或通过邀请码加入已有组织。

本期注册规则采用“创建组织 + 最小邀请能力”：

- 注册接口支持两种模式：创建新组织、使用邀请码加入已有组织。
- `organization_name` 必须全局唯一。
- 创建组织时如果 `organization_name` 已存在，直接返回 409，不允许自动加入。
- 新组织的第一个用户成为该组织 `super_admin`。
- 同一组织后续用户加入必须使用一次性邀请码，本期不开放“自由加入已有组织”。
- `super_admin` 可以生成邀请码；邀请码只能使用一次，过期或已使用后失效。
- 邀请码表建议为 `org_invites`，存 `code_hash`，cookie/页面/邮件中出现的是原始邀请码，数据库不保存明文。
- 邀请码默认有效期 7 天；`super_admin` 创建时可指定更短有效期。
- 邀请码过期后不可使用；过期、已使用或已撤销记录保留 30 天用于审计。
- 邀请码原始值必须是高熵随机值，建议使用 `secrets.token_urlsafe(16)` 或等价强度，不使用 6 位数字或短字母码。
- 因邀请码本身使用高熵随机值，`code_hash` 使用 SHA-256 并存 64 位 hex 字符串。
- 如果未来产品坚持短信验证码式短邀请码，例如 8 位大写字母数字，则 `code_hash` 必须改用 bcrypt/argon2，且注册接口必须对邀请码校验做严格限流。
- MVP 阶段邀请码交付方式为 super_admin 在系统管理页生成邀请链接 `/register?invite=<code>`，手动复制发送给同事；本期不做邮件或飞书消息投递。
- 前端 `InvitePage` 创建成功后用弹窗展示完整邀请链接并提供“复制链接”按钮，关闭后不再展示原始邀请码。
- 邀请码原始值只在创建时展示一次，不能写入前端日志、后端日志或错误上报平台。
- 创建组织、默认部门和用户必须在一个数据库事务中完成，任何一步失败全部回滚。

这样可以关闭“攻击者抢注已有组织并成为管理员”的 race condition 风险。

建议请求体：

```json
{
  "mode": "create_org",
  "email": "user@example.com",
  "username": "user01",
  "password": "password",
  "full_name": "用户姓名",
  "organization_name": "示例企业",
  "department_name": "默认部门"
}
```

使用邀请码加入已有组织时：

```json
{
  "mode": "join_by_invite",
  "email": "member@example.com",
  "username": "member01",
  "password": "password",
  "full_name": "成员姓名",
  "invite_code": "one-time-code"
}
```

建议响应：

```json
{
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "username": "user01",
    "full_name": "用户姓名",
    "role": "super_admin",
    "org_id": "org-id",
    "department_id": "department-id",
    "must_change_password": false
  },
  "org": {
    "id": "org-id",
    "name": "示例企业"
  },
  "department": {
    "id": "department-id",
    "name": "默认部门"
  }
}
```

说明：

- 密码必须哈希存储。
- 不返回密码哈希。
- 注册成功后同时创建 `auth_session` 并通过 `Set-Cookie: session_token=...` 写入登录 cookie，前端直接进入 `/chat`。
- 使用邀请码注册时，`org_id`、`department_id`、`role` 以服务端邀请码记录为准，不能信任前端传入值。

注册错误码：

| 场景 | HTTP 状态码 | 错误码 |
|---|---:|---|
| `organization_name` 已存在 | 409 | `ORG_NAME_TAKEN` |
| `username` 已存在 | 409 | `USERNAME_TAKEN` |
| `email` 已存在 | 409 | `EMAIL_TAKEN` |
| `invite_code` 无效 | 400 | `INVITE_INVALID` |
| `invite_code` 已使用 | 400 | `INVITE_USED` |
| `invite_code` 已过期 | 400 | `INVITE_EXPIRED` |
| `invite_code` 已撤销 | 400 | `INVITE_REVOKED` |
| 密码强度不足 | 400 | `PASSWORD_TOO_WEAK` |
| 注册 IP 限流 | 429 | `RATE_LIMITED` |
| 邮箱未验证，如果启用邮箱验证 | 403 | `EMAIL_NOT_VERIFIED` |

### 5.1.1 用户唯一性规则

本期采用：

- `username` 全局唯一，登录主标识优先使用 `username`。
- `email` 全局唯一，降低账号找回、审计和通知复杂度。

如果未来要支持同一邮箱加入多个组织，应迁移为：

```text
users.email 不再全局唯一
memberships(org_id, user_id, role, department_id)
UNIQUE(org_id, email)
```

同时登录接口需要额外传入组织标识，或先登录用户再选择组织。

### 5.1.2 邀请码接口

建议新增：

```text
POST /api/auth/invites
GET /api/auth/invites
DELETE /api/auth/invites/{id}
GET /api/auth/invites/validate?code=...
```

本期权限：

- 仅当前组织 `super_admin` 可创建邀请码。
- 普通用户只能使用邀请码注册，不能查看或管理邀请码。
- 本期暂不做管理员踢人和跨用户 session 管理。
- `GET /api/auth/invites/validate` 用于注册页预校验邀请码状态，只返回是否有效、过期时间、目标组织名称和部门名称，不返回 `code_hash`、创建人敏感信息或可用于枚举的邀请码明文。
- 邀请码校验接口必须做 IP 限流，避免被用于暴力枚举。

邀请码字段：

```text
id
org_id
code_hash
role
department_id
expires_at
used_by
used_at
revoked_at
created_by
created_at
```

#### GET /api/auth/invites/validate?code=...

用途：注册页预校验邀请码，避免用户填完注册表后才发现邀请码不可用。

认证：不需要登录，但必须限流。

建议响应：

```json
{
  "valid": true,
  "org": {
    "name": "示例企业"
  },
  "department": {
    "name": "产品运营部"
  },
  "role": "user",
  "expires_at": "2026-09-21T12:00:00Z"
}
```

无效、过期、已使用、已撤销邀请码可统一返回：

```json
{
  "valid": false,
  "code": "INVITE_INVALID",
  "message": "邀请码无效或已失效"
}
```

规则：

- 只返回注册页展示所需信息，不返回 `code_hash`、`org_id`、`department_id`、`created_by` 或其他敏感字段。
- 无效、已使用、已过期、已撤销可使用统一文案，减少枚举价值；前端可在真正注册失败时展示更细错误。
- 必须按 IP 限流。

### 5.2 POST /api/auth/login

用途：账号密码登录，创建服务端认证会话并写 cookie。

建议请求体：

```json
{
  "username": "Admin",
  "password": "7777"
}
```

或支持：

```json
{
  "email": "user@example.com",
  "password": "password"
}
```

建议响应头：

```text
Set-Cookie: session_token=<random-token>; HttpOnly; SameSite=Lax; Path=/
```

建议响应体：

```json
{
  "user": {
    "id": "user-id",
    "username": "Admin",
    "email": "admin@example.com",
    "full_name": "管理员",
    "role": "super_admin",
    "org_id": "org-id",
    "department_id": "department-id",
    "must_change_password": false
  },
  "org": {
    "id": "org-id",
    "name": "示例企业"
  },
  "department": {
    "id": "department-id",
    "name": "默认部门"
  }
}
```

`/api/auth/register`、`/api/auth/login`、`/api/auth/me` 返回结构统一为 `{ "user": ..., "org": ..., "department": ... }`，避免前端为注册、登录和刷新登录态写多套解析逻辑。

临时密码状态处理：

- 如果用户 `must_change_password = true`，登录接口仍然校验通过并正常签发 `session_token`。
- 响应体中的 `user.must_change_password` 返回 `true`。
- 前端 AuthGate 根据该字段强制跳转 `/change-password`。
- 登录接口本身不拒绝临时密码状态用户，否则用户无法进入改密闭环。

兼容期可以继续返回 `access_token` 和 `refresh_token`，但前端应逐步转向 cookie。

### 5.3 POST /api/auth/logout

用途：退出登录。

请求：不需要 body，依赖 cookie 中的 `session_token`。

幂等性：`logout` 必须是幂等接口。无论 session 是否存在、是否已过期、是否已撤销，后端都应返回 `200` 并清除 cookie；只有 CSRF 校验失败时返回 `403 CSRF_INVALID`。

行为：

- 对 cookie 中的原始 token 做哈希，查找 `auth_sessions.token_hash`。
- 找到有效 session 时设置 `revoked_at = now()`，或删除该 session。
- 查不到 session、session 已过期或 session 已撤销时，不报错，仍然返回成功并清除 cookie。
- 返回清除 cookie 的响应头。

建议响应头：

```text
Set-Cookie: session_token=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/
```

建议响应体：

```json
{
  "success": true
}
```

前端处理：

- 登出成功后清理前端用户状态、内存缓存、当前问答消息、当前 chat session 状态和本地兼容期 token。
- 登出成功后跳转 `/login`，不携带 `redirect`，避免用户退出后又自动回到受保护页面。
- 登出是用户主动丢弃本地登录态的操作；前端对 logout 的任何失败，包括网络错误、401、403、4xx、5xx，都必须清理本地状态并跳 `/login`，不能把用户卡在登录态。
- 如果后端 session 未能立即撤销，可在过期清理任务中自然失效，或下次联网后补偿重试 logout。
- 多标签页场景下，应通过 `BroadcastChannel` 或 `storage` 事件广播 logout，其他标签收到后同步清理状态并跳 `/login`。

### 5.4 GET /api/auth/me

用途：获取当前登录用户。

认证来源：

1. 优先读取 cookie `session_token`。
2. 兼容期可读取 `Authorization: Bearer <access_token>`。

建议响应：

```json
{
  "user": {
    "id": "user-id",
    "username": "Admin",
    "email": "admin@example.com",
    "full_name": "管理员",
    "role": "super_admin",
    "org_id": "org-id",
    "department_id": "department-id",
    "must_change_password": false
  },
  "org": {
    "id": "org-id",
    "name": "示例企业"
  },
  "department": {
    "id": "department-id",
    "name": "默认部门"
  }
}
```

未登录或 session 失效返回 `401`。

### 5.5 GET /api/auth/csrf

用途：下发 CSRF token，供前端已登录写操作携带 `X-CSRF-Token`。

认证：必须已登录，依赖 cookie 中的 `session_token`。本接口自身不需要 `X-CSRF-Token`；未登录或 session 失效返回 `401`。

建议响应：

```json
{
  "csrf_token": "random-csrf-token"
}
```

规则：

- CSRF token 只为已登录的 auth session 签发，前端只保存在内存中。
- 本期固定把 `csrf_token_hash` 存入 `auth_sessions` 表，不使用服务端内存 dict，也不依赖 Redis。
- 存储算法使用 SHA-256，保存 64 位 hex；CSRF token 本体必须使用密码学安全随机数生成。
- 选择表内存储的理由：和 session 生命周期天然绑定，session 撤销或重签时自动失效；支持本期单机和后续多实例部署，不额外引入 Redis。
- session 过期、撤销或重新签发后，旧 CSRF token 同步失效。
- 登录、注册接口豁免 CSRF，因此未登录用户不需要也不能获取 CSRF token。
- 本期不采用 double-submit cookie；如未来改用该方案，需要另行更新本文档和前端实现。
- 本期登录、注册豁免 CSRF；已登录写操作必须校验。

### 5.6 POST /api/auth/change-password

用途：当前用户修改密码；也用于 `must_change_password=true` 时完成强制改密。

认证：必须已登录，必须携带有效 `session_token`，必须通过 CSRF 校验。

前端调用流程：

1. 用户已登录后，前端先调用 `GET /api/auth/csrf` 获取 CSRF token。
2. 调用 `POST /api/auth/change-password` 时携带 cookie 和 `X-CSRF-Token`。
3. 后端在同一事务内完成密码更新、session 重签、旧 session 撤销和响应体返回。

建议请求体：

```json
{
  "old_password": "old-password",
  "new_password": "new-password"
}
```

建议响应头：

```text
Set-Cookie: session_token=<new-random-token>; HttpOnly; SameSite=Lax; Path=/
```

建议响应体：

```json
{
  "user": {
    "id": "uuid",
    "username": "zhangsan",
    "email": "zhangsan@example.com",
    "full_name": "张三",
    "org_id": "uuid",
    "department_id": "uuid",
    "role": "user",
    "must_change_password": false
  },
  "org": {
    "id": "uuid",
    "name": "示例组织"
  },
  "department": {
    "id": "uuid",
    "name": "产品运营部"
  }
}
```

规则：

- 同时校验 session cookie 和 CSRF token，任一无效则拒绝。
- 校验旧密码正确。
- 校验新密码强度。
- 更新 `users.hashed_password`。
- 设置 `users.must_change_password = false`。
- 撤销该用户除当前请求外的其他有效 `auth_sessions`。
- 当前请求重新签发 session token，只保存新 token 的 `token_hash`，并通过 `Set-Cookie` 写入浏览器。
- 旧的当前 session 记录应标记 `revoked_at`，避免旧 cookie 继续使用。

错误码：

| 场景 | HTTP 状态码 | 错误码 |
|---|---:|---|
| 未登录或 session 失效 | 401 | `UNAUTHORIZED` |
| CSRF 校验失败 | 403 | `CSRF_INVALID` |
| 旧密码错误 | 400 | `OLD_PASSWORD_INVALID` |
| 新密码强度不足 | 400 | `PASSWORD_TOO_WEAK` |
| 用户已停用 | 403 | `USER_DISABLED` |

## 6. 现有表结构盘点

当前已有表：

| 表名 | 当前隔离字段 | 是否需要新增 org_id | 说明 |
|---|---|---:|---|
| `departments` | 无上级组织 | 是 | 新增 `org_id`，部门归属组织 |
| `users` | `department_id` | 是 | 用户必须归属组织 |
| `knowledge_bases` | `department_id` | 是 | 知识库必须归属组织 |
| `documents` | `department_id`、`knowledge_base_id`、`uploaded_by` | 是 | 文档必须归属组织，建议继续保留 `uploaded_by` |
| `document_chunks` | `department_id`、`knowledge_base_id`、`document_id` | 是 | RAG 检索必须按 `org_id` 过滤 |
| `chat_sessions` | `user_id`、`department_id`、`knowledge_base_id` | 是 | 问答历史必须按组织隔离 |
| `chat_messages` | 通过 `session_id` 间接隔离 | 可选 | 可通过 `chat_sessions.org_id` 间接隔离，非必要不加 |
| `api_usage_logs` | `user_id` | 是 | 审计和费用统计建议显式带 `org_id` |
| `processes` | `department_id`、`knowledge_base_id` | 是 | 流程图属于组织和部门 |
| `process_nodes` | 通过 `process_id` 间接隔离 | 可选 | 可通过 `processes.org_id` 间接隔离 |
| `process_edges` | 通过 `process_id` 间接隔离 | 可选 | 可通过 `processes.org_id` 间接隔离 |
| `process_documents` | 通过 process/document 间接隔离 | 可选 | 建议靠关联表两端校验 |
| `process_node_chunks` | 通过 process/chunk 间接隔离 | 可选 | 建议靠关联表两端校验 |

建议新增表：

| 表名 | 用途 |
|---|---|
| `organizations` | 组织/租户边界 |
| `auth_sessions` | 服务端认证会话 |
| `org_invites` | 组织成员一次性邀请码 |
| `audit_logs` | 安全事件与关键操作审计 |

`org_invites` 必备索引：

```sql
CREATE INDEX idx_org_invites_org_id ON org_invites(org_id);
CREATE UNIQUE INDEX idx_org_invites_code_hash ON org_invites(code_hash);
CREATE INDEX idx_org_invites_expires_at ON org_invites(expires_at);
```

## 7. 现有 API 路由盘点

| 路由 | 当前认证方式 | 当前权限依据 | 迁移影响 |
|---|---|---|---|
| `POST /api/auth/login` | 用户名密码 + JWT | `users.username` | 改为创建 `auth_sessions` 并 Set-Cookie；兼容期保留 token 返回 |
| `POST /api/auth/refresh` | Refresh Token | JWT `sub/type` | cookie session 方案稳定后可废弃 |
| `GET /api/auth/me` | Bearer Token | `users.id` | 改为优先 cookie session，并返回 `{ user, org, department }` |
| `POST /api/auth/change-password` | 暂无 | 暂无 | 当前用户改密，校验 CSRF，成功后重签当前 session |
| `GET /api/auth/sessions` | 暂无 | 暂无 | 后续列出当前用户活跃认证会话 |
| `DELETE /api/auth/sessions/{id}` | 暂无 | 暂无 | 后续撤销指定认证会话 |
| `POST /api/auth/logout-all` | 暂无 | 暂无 | 本期延后，不在阶段 3 实现；后续仅撤销当前用户自己的全部 session |
| `GET /api/auth/csrf` | 暂无 | 暂无 | 已登录后下发 CSRF token，供前端写操作携带 `X-CSRF-Token`；未登录返回 401 |
| `POST /api/auth/invites` | 暂无 | 暂无 | 当前组织 super_admin 创建一次性邀请码 |
| `GET /api/auth/invites` | 暂无 | 暂无 | 当前组织 super_admin 查看未使用邀请码 |
| `DELETE /api/auth/invites/{id}` | 暂无 | 暂无 | 当前组织 super_admin 撤销邀请码 |
| `GET /api/auth/invites/validate` | 暂无 | 暂无 | 注册页预校验邀请码，需限流且不返回敏感信息 |
| `POST /api/admin/users/{id}/reset-password` | 暂无 | 暂无 | 当前组织 super_admin 重置本组织用户密码，设置 `must_change_password=true` 并撤销该用户全部 session |
| `GET /api/kbs` | Bearer Token | `department_id` | 增加 `org_id` 过滤 |
| `POST /api/kbs` | Bearer Token | `department_id` + role | 创建时写入 `org_id` |
| `GET /api/documents` | Bearer Token | `knowledge_base_id` + `department_id` | 增加 `org_id` 过滤 |
| `GET /api/documents/{id}` | Bearer Token | `department_id` | 增加 `org_id` 过滤 |
| `POST /api/documents/{id}/parse` | Bearer Token | `department_id` | 增加 `org_id` 过滤；生成 chunk 写入 `org_id` |
| `DELETE /api/documents/{id}` | Bearer Token | `department_id` + role | 增加 `org_id` 过滤 |
| `POST /api/upload/file` | Bearer Token | `knowledge_base_id` + `department_id` | 上传文档写入 `org_id`、`uploaded_by` |
| `POST /api/upload/link` | Bearer Token | `knowledge_base_id` + `department_id` | 链接文档写入 `org_id`、`uploaded_by` |
| `POST /api/chat/stream` | Bearer Token | `knowledge_base_id` + `department_id` | 检索 query 增加 `org_id`，会话写入 `org_id` |
| `GET /api/sessions` | Bearer Token | `user_id` + `department_id` | 查询问答会话增加 `org_id` |
| `POST /api/sessions` | Bearer Token | `knowledge_base_id` + `department_id` | 创建问答会话写入 `org_id` |
| `GET /api/sessions/{id}` | Bearer Token | `user_id` + `department_id` | 增加 `org_id` 过滤 |
| `DELETE /api/sessions/{id}` | Bearer Token | `user_id` + `department_id` | 增加 `org_id` 过滤 |
| `GET /api/processes` | Bearer Token | `department_id` | 增加 `org_id` 过滤 |
| `POST /api/processes` | Bearer Token | `department_id` + role | 创建流程写入 `org_id` |
| `GET /api/admin/users` | Bearer Token | role + `department_id` | 增加 `org_id` 过滤 |
| `GET /api/admin/departments` | Bearer Token | role + `department_id` | 增加 `org_id` 过滤 |

## 8. 对现有代码影响清单

### 8.1 后端模型

需要新增：

- `backend/app/models/organization.py`
- `backend/app/models/auth_session.py`
- `backend/app/models/audit_log.py`
- `backend/app/models/org_invite.py`

需要调整：

- `backend/app/models/department.py`：新增 `org_id`
- `backend/app/models/user.py`：新增 `org_id`、`must_change_password`
- `backend/app/models/knowledge_base.py`：新增 `org_id`
- `backend/app/models/document.py`：新增 `org_id`
- `backend/app/models/chunk.py`：新增 `org_id`
- `backend/app/models/chat.py`：`ChatSession` 新增 `org_id`
- `backend/app/models/audit.py`：新增 `org_id`
- `backend/app/models/process.py`：`Process` 新增 `org_id`

### 8.2 后端 schema

需要调整：

- `schemas/auth.py`：新增 register 请求/响应；`UserProfile` 返回 `org_id`
- `schemas/kb.py`：返回 `org_id`
- `schemas/document.py`：返回 `org_id`
- `schemas/session.py`：返回 `org_id`
- `schemas/process.py`：返回 `org_id`

### 8.3 后端 API

需要调整：

- `api/auth.py`：新增 register/logout；login 写 cookie；me 读 cookie
- `api/auth.py`：新增邀请码创建、列表和撤销接口；register 支持创建组织和邀请码加入两种模式
- `dependencies.py`：新增 cookie session 认证依赖，兼容 Bearer Token
- `api/knowledge_bases.py`：所有查询增加 `org_id`
- `api/documents.py`：所有查询增加 `org_id`
- `api/upload.py`：创建文档写入 `org_id`
- `api/chat.py`：创建 chat session 写入 `org_id`，RAG 检索传入 `org_id`
- `api/sessions.py`：问答会话查询增加 `org_id`
- `api/processes.py`：流程查询增加 `org_id`
- `api/admin.py`：用户、部门查询增加 `org_id`

### 8.4 后端服务

需要调整：

- `services/ingestion.py`：生成 chunk 时写入 `org_id`
- `services/retriever.py`：检索参数新增 `org_id`，pgvector SQL where 增加 `DocumentChunk.org_id == current_user.org_id`
- 如果未来切换到 Chroma、Qdrant、Milvus、Pinecone 等外部向量库，向量 collection 的 metadata 必须包含 `org_id`、`department_id`、`knowledge_base_id`、`document_id`；检索时必须把 `org_id` 作为必填 metadata filter 前置传入，不能先召回再在应用层丢弃。
- `services/chat_service.py`：通常不用改，除非 prompt 需要加入组织上下文
- `services/parser/*`：通常不用改

### 8.5 前端

需要调整：

- `app/page.tsx` 中登录态存储从 token 转向 cookie。
- 所有 fetch 对受保护接口增加 `credentials: "include"`。
- 登出按钮调用 `POST /api/auth/logout`，成功后清理前端状态并跳登录。
- `UserInfo` 类型新增 `org_id`。
- 后续路由拆分时，对 `/chat`、`/documents`、`/knowledge` 等受保护页面加 `middleware.ts` cookie 存在性检查和 AuthGate 状态门禁。
- 前端 middleware/AuthGate 只负责用户体验，不是安全边界；真正权限必须由后端每个接口的认证依赖、`org_id` 过滤和角色判断保证。

前端结构迁移不放在本文档中执行，详见 `docs/frontend-structure-migration.md`。认证迁移阶段 5 会触发前端 cookie 化；文件结构迁移可以并行规划，但不应和认证底层改造混在同一次大改中。注册页、改密页、邀请码管理页和认证会话管理页的目录归属，以 `docs/frontend-structure-migration.md` 为准。

## 8.6 注册登录联调顺序

接口联调顺序：

```text
1. POST /api/auth/register
2. POST /api/auth/login
3. GET /api/auth/me
4. POST /api/auth/logout
5. GET /api/auth/me
```

验证点：

- register 成功后数据库存在 `organizations`、`departments`、`users`。
- 密码字段为哈希，不保存明文。
- login 响应头存在 `Set-Cookie: session_token=...`。
- 浏览器后续请求携带 cookie。
- me 能返回 `{ user, org, department }`。
- logout 后 cookie 被清除，`auth_sessions.revoked_at` 被写入。
- logout 后再次调用 me 返回 401。

前端联调要求：

- `features/auth/api.ts` 封装 register、login、logout、me。
- `apiClient` 默认携带 `credentials: "include"`。
- 登录成功后写入前端用户内存状态，不再把新版 Web token 写入 `localStorage`。
- 页面刷新时调用 `/api/auth/me` 恢复登录态。
- 未登录或 401 时跳 `/login?redirect=<当前路径>`。
- 登出成功时跳 `/login`，不带 redirect。

示例验证命令：

```powershell
curl.exe -i -X POST http://127.0.0.1:8000/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"Admin\",\"password\":\"7777\"}"
curl.exe -i http://127.0.0.1:8000/api/auth/me --cookie "session_token=<cookie-value>"
curl.exe -i -X POST http://127.0.0.1:8000/api/auth/logout --cookie "session_token=<cookie-value>"
```

调试策略：

- 如果登录成功但刷新掉线，先检查响应头是否有 `Set-Cookie`。
- 如果有 `Set-Cookie` 但后续请求没带 cookie，检查前端 `credentials: "include"` 和后端 CORS。
- 如果 cookie 带上但返回 401，检查 `token_hash`、`expires_at`、`revoked_at`、用户 `is_active`。
- 如果 SSE 问答中途 401，前端应关闭连接并跳登录页，后端应记录认证失败审计。

## 9. 迁移阶段

### 阶段 1：数据库安全扩展

- 新增 `organizations`
- 新增 `auth_sessions`
- 给目标表增加可空 `org_id`
- 回填默认组织
- 验证数据行数和外键关系

该阶段不改变线上行为。

### 阶段 2：模型与 schema 对齐

- SQLAlchemy 模型新增字段。
- Pydantic schema 返回 `org_id`。
- 所有创建逻辑先写入 `org_id`，但认证仍兼容旧 JWT。
- 旧 JWT 中可能没有 `org_id` claim，因此兼容期不能依赖 JWT claim 判断组织；必须通过 JWT `sub` 反查 `users.org_id`。
- 阶段 2 后签发的新 JWT 可以加入 `org_id` claim，但后端仍以数据库用户记录为准。

该阶段后，原有登录、上传、解析、问答应保持不变。

### 阶段 3：认证接口升级

- `POST /api/auth/register`
- `POST /api/auth/login` 生成随机 session token，数据库只存 `token_hash`，创建 `auth_sessions` 并 Set-Cookie
- `POST /api/auth/logout` 撤销 session 并清 cookie
- `GET /api/auth/me` 优先读 cookie
- `GET /api/auth/csrf` 下发 CSRF token
- `POST /api/auth/change-password` 当前用户改密，成功后重签当前 session
- `GET /api/auth/sessions` 当前用户查看自己的活跃认证会话
- `DELETE /api/auth/sessions/{id}` 当前用户撤销自己的指定认证会话
- `POST /api/auth/logout-all` 本期延后，不在阶段 3 实现；如必须上线，权限范围仅限当前用户自己的全部 session
- `POST /api/auth/invites` 当前组织 `super_admin` 创建一次性邀请码
- `GET /api/auth/invites` 当前组织 `super_admin` 查看未使用邀请码
- `DELETE /api/auth/invites/{id}` 当前组织 `super_admin` 撤销邀请码
- `POST /api/admin/users/{id}/reset-password` 当前组织 `super_admin` 重置本组织用户密码并触发强制改密；若阶段 3 暂不做完整管理员用户管理，则必须提供测试 fixture 覆盖 `must_change_password=true` 验收场景
- `GET /api/auth/invites/validate` 注册页预校验邀请码，需限流且不返回敏感字段

兼容期保留 Bearer Token，降低前端一次性切换风险。

### 阶段 4：业务查询增加 org_id

- 知识库、文档、chunk、问答会话、审计、流程全部按 `org_id` 过滤。
- RAG 检索必须加入 `org_id`。
- 增加跨组织隔离测试。
- 增加同组织跨部门隔离测试。

### 阶段 5：前端 cookie 化

- fetch 默认 `credentials: "include"`。
- 登录后不再依赖 localStorage token。
- 登出调用服务端 logout。
- 前端通过 middleware/AuthGate 保护 `/chat`、`/documents`、`/knowledge` 等受保护页面。

### 阶段 6：清理旧认证路径

- 稳定后移除 Refresh Token 接口。
- 移除 localStorage token 保存逻辑。
- 移除 Bearer Token 兼容认证前，先增加埋点统计仍有多少请求使用 Bearer Token。
- 若仍有移动端、CLI、脚本或第三方集成依赖 Bearer Token，不应直接删除；可以保留只读 Bearer 路径或单独设计 Personal Access Token。

## 10. 索引计划

新增 `org_id` 后，大多数查询都会把 `org_id` 放在 where 条件中。必须同时考虑单列索引和高频复合索引。

基础索引：

```sql
CREATE INDEX idx_departments_org_id ON departments(org_id);
CREATE INDEX idx_users_org_id ON users(org_id);
CREATE INDEX idx_knowledge_bases_org_id ON knowledge_bases(org_id);
CREATE INDEX idx_documents_org_id ON documents(org_id);
CREATE INDEX idx_document_chunks_org_id ON document_chunks(org_id);
CREATE INDEX idx_chat_sessions_org_id ON chat_sessions(org_id);
CREATE INDEX idx_api_usage_logs_org_id ON api_usage_logs(org_id);
CREATE INDEX idx_processes_org_id ON processes(org_id);
CREATE INDEX idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX idx_auth_sessions_org_id ON auth_sessions(org_id);
CREATE UNIQUE INDEX idx_auth_sessions_token_hash ON auth_sessions(token_hash);
CREATE INDEX idx_auth_sessions_csrf_token_hash ON auth_sessions(csrf_token_hash);
CREATE INDEX idx_auth_sessions_expires_at ON auth_sessions(expires_at);
```

建议复合索引：

```sql
CREATE INDEX idx_documents_kb_org ON documents(knowledge_base_id, org_id);
CREATE INDEX idx_chunks_kb_org ON document_chunks(knowledge_base_id, org_id);
CREATE INDEX idx_chunks_doc_org ON document_chunks(document_id, org_id);
CREATE INDEX idx_chat_sessions_user_org ON chat_sessions(user_id, org_id);
CREATE INDEX idx_kbs_department_org ON knowledge_bases(department_id, org_id);
```

## 11. 审计日志事件

建议新增 `audit_logs`，与 `api_usage_logs` 分离：

- `api_usage_logs`：记录模型调用量、token 数、费用估算、响应耗时。
- `audit_logs`：记录安全事件和关键业务操作。

建议字段：

```text
id
org_id
user_id
event_type
ip
user_agent
metadata_json
created_at
```

保留策略：

- MVP 默认保留 180 天。
- 企业合规部署建议保留 1 年以上，具体按单位制度配置。
- 数据量增大后建议按月分区，分区键使用 `created_at`。
- 后续可增加导出能力，支持按时间、用户、事件类型导出审计日志。

认证事件至少包括：

- `auth.register.success`
- `auth.login.success`
- `auth.login.failed`
- `auth.logout`
- `auth.logout_all`
- `auth.session.revoked`
- `auth.password.changed`
- `auth.account.locked`
- `auth.invite.created`
- `auth.invite.used`
- `auth.invite.revoked`

业务事件至少包括：

- `document.uploaded`
- `document.parsed`
- `document.deleted`
- `chat.created`
- `chat.asked`
- `kb.created`

## 12. 密码重置与管理员兜底

本期最小方案：

- 不开放用户自助找回密码。
- 组织 `super_admin` 可在后台为本组织用户重置密码，生成一次性临时密码。
- 用户使用临时密码首次登录后必须修改密码。
- 用户主动修改密码成功后，撤销该用户其他旧 session，并重新签发当前 session。
- 管理员重置用户密码后，撤销该用户全部旧 session，并要求用户使用临时密码重新登录。

必须新增字段承载改密状态：

```text
users.must_change_password BOOLEAN NOT NULL DEFAULT false
```

流程：

```text
super_admin 重置密码
-> 更新 hashed_password
-> 设置 must_change_password = true
-> 撤销该用户全部 auth_sessions
-> 用户使用临时密码登录
-> /api/auth/me 返回 must_change_password: true
-> 前端强制跳转 /change-password，禁止进入其他业务页面
-> 用户改密成功
-> 设置 must_change_password = false
-> 撤销该用户其他旧 session
-> 当前请求重新签发 session 并 Set-Cookie: session_token=...
-> 接口返回 { user, org, department }
-> 前端清空旧 CSRF token，更新 AuthContext，重新获取 CSRF token 后进入 /chat
```

本期为了让强制改密闭环可验收，必须二选一：

- 实现 `POST /api/admin/users/{id}/reset-password`：仅允许当前组织 `super_admin` 操作本组织用户；接口生成临时密码或接收管理员输入的新临时密码，密码哈希后入库，设置 `must_change_password=true`，撤销目标用户全部有效 `auth_sessions`，并写入审计日志。
- 如果暂不开放管理员用户管理页，则测试环境必须提供 fixture 或种子脚本，把指定用户置为 `must_change_password=true`。只靠手工改数据库不算可复现验收方案。

组织管理员兜底：

- 同一组织允许多个 `super_admin`。
- `super_admin` 可任命本组织其他用户为 `super_admin`。
- 如果组织内所有 `super_admin` 都不可用，需由平台级管理员介入恢复。
- 本期可预留 `users.is_platform_admin` 或后续新增平台管理员表，但不要让普通组织 `super_admin` 默认跨组织。

## 13. 认证会话管理权限边界

本期只做“自己管自己”：

- 普通用户只能查看和撤销自己的认证 session。
- `GET /api/auth/sessions` 只返回当前用户的活跃 session。
- `DELETE /api/auth/sessions/{id}` 只能撤销当前用户自己的 session。
- `POST /api/auth/logout-all` 只撤销当前用户自己的全部 session。
- 管理员强制踢掉他人 session 后续再做，避免本期权限面扩大。

未来企业管理能力：

- 组织 `super_admin` 可查看本组织用户 session。
- 组织 `super_admin` 可强制撤销本组织用户 session。
- 所有管理员操作必须写入 `audit_logs`。

## 14. 回滚策略

### 14.1 数据库回滚

迁移应按“先可空、后回填、再约束”进行。若阶段 1 出现问题：

- 可删除新增索引。
- 可删除新增可空列。
- 可删除 `auth_sessions` 和 `organizations`。
- 原有 `department_id` 权限模型仍可工作。

### 14.2 代码回滚

每阶段必须保持功能可运行：

- 阶段 1 只加表和列，不改行为，最容易回滚。
- 阶段 2 若失败，可回退模型和 schema，但数据库新增列可暂时保留。
- 阶段 3 若 cookie 登录失败，可保留旧 JWT 登录作为 fallback。
- 阶段 4 若 org 过滤导致误拦截，可临时回退到 `department_id` 过滤，同时保留 `org_id` 写入。
- 阶段 5 若前端 cookie 认证不稳定，可临时恢复 localStorage token。

### 14.3 数据回滚

- 阶段 1-2 回滚：新增列多为可空，删除列即可，原业务数据不丢失。
- 阶段 3 回滚：保留 `auth_sessions` 和 `audit_logs` 数据，关闭 cookie 认证路径，恢复 Bearer Token 为主。
- 阶段 4 回滚：保留 `org_id` 写入逻辑，查询条件临时退回 `department_id`，同时排查误拦截原因。
- 阶段 5 回滚：前端恢复 localStorage token；后端保留 cookie 路径，避免用户 session 数据丢失。
- 不建议因为用户离职或停用而物理删除用户。用户应通过 `is_active = false` 软停用，撤销其全部认证 session；历史文档、chunk、问答和审计记录应保留。
- `users` 与 `documents`、`knowledge_bases`、`chat_sessions` 不建议使用会导致业务数据丢失的级联删除；如需物理删除，只能由平台管理员在确认归档后执行。

### 14.4 数据校验与保护

每次阶段完成后至少检查：

```sql
SELECT COUNT(*) FROM organizations;
SELECT COUNT(*) FROM departments WHERE org_id IS NULL;
SELECT COUNT(*) FROM users WHERE org_id IS NULL;
SELECT COUNT(*) FROM knowledge_bases WHERE org_id IS NULL;
SELECT COUNT(*) FROM documents WHERE org_id IS NULL;
SELECT COUNT(*) FROM document_chunks WHERE org_id IS NULL;
SELECT COUNT(*) FROM chat_sessions WHERE org_id IS NULL;
```

任何表仍存在 `org_id IS NULL` 时，不允许进入“加 NOT NULL 约束”阶段。

## 15. 建议测试清单

- 注册用户后，`organizations`、`departments`、`users` 均有正确记录。
- 同名组织重复注册返回 409。
- 使用一次性邀请码可加入已有组织。
- 邀请码过期、已使用或被撤销时注册失败。
- 普通用户不能创建、查看或撤销邀请码，返回 403。
- 使用邀请码注册后，新用户的 `org_id`、`role`、`department_id` 与邀请码一致。
- 注册和登录接口有速率限制。
- 密码字段是哈希，不保存明文。
- 登录成功响应包含 `Set-Cookie: session_token=...`。
- `auth_sessions` 只保存 `token_hash`，不保存 cookie 原始值。
- session 仅在剩余有效期不足阈值时滑动续期，避免每次请求写库。
- 刷新页面后 `/api/auth/me` 仍返回用户。
- 登出后 `auth_sessions.revoked_at` 有值，cookie 被清除。
- 登出后 `/api/auth/me` 返回 401。
- 未登录访问受保护接口返回 401。
- A 组织上传文档后，B 组织用户无法在文档列表看到。
- A 组织上传文档后，B 组织用户 RAG 检索无法召回。
- 同一组织内，A 部门普通用户无法看到 B 部门文档。
- 同一组织内，A 部门管理员无法管理 B 部门文档。
- 同一组织内，组织超级管理员可以查看本组织全部部门数据。
- 前端 middleware/AuthGate 被绕过时，后端接口仍返回 401、403 或 404。
- 原有上传、解析、问答、引用来源、历史会话功能保持可用。
