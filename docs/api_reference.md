# API Reference

## Auth

- `POST /api/auth/register`：注册账号；可创建新组织，或使用邀请码加入已有组织；成功后创建服务端 session，并通过 `Set-Cookie: session_token=...` 写入 httpOnly cookie。
- `POST /api/auth/login`：请求体必填 `username`、`password`、`role`（`super_admin` / `dept_admin` / `user`）。账号密码校验通过后，所选角色必须与数据库实际角色一致，否则返回 403 / `ROLE_MISMATCH`，不创建 session、不签发 token 或 cookie；缺失或非法 role 返回 422。成功后创建服务端 session，并通过 `Set-Cookie: session_token=...` 写入 httpOnly cookie，同时返回 Access Token 和 Refresh Token。权限始终取自数据库角色；旧登录调用方也必须补传 role。
- `POST /api/auth/refresh`：使用 Refresh Token 换取新的 Access Token 和 Refresh Token。
- `POST /api/auth/logout`：幂等登出；撤销当前 cookie session 并清除 `session_token` cookie。即使 session 已过期或不存在，也返回 `{ "success": true }`。
- `GET /api/auth/me`：获取当前用户信息。
- `GET /api/auth/csrf`：已登录用户获取 CSRF token；后端将 token 哈希绑定到当前 `auth_sessions` 记录。
- `POST /api/auth/change-password`：修改密码，需携带 `X-CSRF-Token`；成功后重新签发当前 session，并返回最新用户、组织、部门信息。
- `POST /api/auth/invites`：超级管理员创建一次性邀请码，需携带 `X-CSRF-Token`。
- `GET /api/auth/invites`：超级管理员查看本组织邀请码列表。
- `DELETE /api/auth/invites/{invite_id}`：超级管理员撤销本组织邀请码，需携带 `X-CSRF-Token`。
- `GET /api/auth/invites/validate?code=...`：校验邀请码是否可用，并返回组织、部门、角色预览信息。
- 本地演示保留旧双令牌兼容：Access Token 有效期默认为 24 小时，Refresh Token 默认为 7 天。新认证闭环优先使用服务端 session + httpOnly cookie。
- 已登录写操作除登出外应携带 `X-CSRF-Token`。前端 cookie 请求需使用 `credentials: "include"`。

## Admin

- `GET /api/admin/users`：管理员查看用户列表；超级管理员查看本组织用户，部门管理员查看本部门用户。
- `GET /api/admin/departments`：管理员查看未归档部门列表。
- `POST /api/admin/users/{user_id}/reset-password`：超级管理员重置本组织用户密码，需携带 `X-CSRF-Token`；接口会撤销该用户所有旧 session，并标记 `must_change_password=true`。

## Organizations And Departments

- `GET /api/organizations?include_archived=true|false`：列出组织；默认只返回未归档组织，超级管理员管理页可携带 `include_archived=true` 查看归档组织。
- `POST /api/organizations`：超级管理员创建组织并自动创建默认部门，需携带 `X-CSRF-Token`；请求体 `{ "name": "组织名", "description": "说明", "department_name": "默认部门名" }`。
- `PUT /api/organizations/{org_id}`：超级管理员编辑未归档组织名称和说明，需携带 `X-CSRF-Token`；同名返回 `409`。
- `PATCH /api/organizations/{org_id}/archive`：超级管理员归档组织，需携带 `X-CSRF-Token`；组织下仍有启用用户时返回 `409`。
- `PATCH /api/organizations/{org_id}/restore`：超级管理员恢复组织，需携带 `X-CSRF-Token`。
- `GET /api/departments?org_id=...&include_archived=true|false`：按权限列出部门；默认只返回未归档部门且所属组织未归档。
- `POST /api/departments`：超级管理员创建部门，需携带 `X-CSRF-Token`；请求体 `{ "org_id": "uuid", "name": "部门名", "description": "说明" }`。
- `PUT /api/departments/{department_id}`：管理员编辑未归档部门，需携带 `X-CSRF-Token`；超级管理员可跨组织，部门管理员仅限自己部门。
- `PATCH /api/departments/{department_id}/archive`：管理员归档部门，需携带 `X-CSRF-Token`；部门下仍有启用用户，或该组织只剩最后一个可用部门时返回 `409`。
- `PATCH /api/departments/{department_id}/restore`：管理员恢复部门，需携带 `X-CSRF-Token`；所属组织已归档时需先恢复组织。

## Knowledge Bases

- `GET /api/kbs`：按当前用户权限列出启用的知识库，返回 `is_active`。管理员可传 `include_disabled=true`；超级管理员可查看全部，部门管理员仅额外看到本部门可管理的禁用知识库，普通用户传此参数返回 403。文档及 Chunk 数统计包含保留的数据。
- `PATCH /api/kbs/{kb_id}/status`：管理员设置启用状态，请求体 `{"is_active": false}`（禁用）或 `{"is_active": true}`（启用），必须是 JSON 布尔值，需要 CSRF 校验。返回完整知识库信息，重复设置同一状态幂等。全局/组织级仅超级管理员可操作，部门级允许本部门管理员操作。
- 知识库禁用保留文档、向量和历史；业务列表隐藏禁用库，直接读取文档、上传、解析、删除文档、新建会话和新问答返回 409 / `KB_DISABLED`，向量及关键词检索均排除禁用库。历史会话仍按原权限可读；已经开始的请求不强制中断。重新启用后原数据恢复可用。
- `PUT /api/kbs/{kb_id}`：编辑启用知识库；禁用状态需先启用再编辑。原 `DELETE /api/kbs/{kb_id}` 已移除（返回 405），不再提供知识库级联删除入口。
- `POST /api/kbs`：管理员创建知识库。

## Documents

- `GET /api/documents?knowledge_base_id=...`：按知识库列出文档。
- `GET /api/documents/{document_id}`：查看文档详情和前 8 个 chunk 预览。
- `POST /api/documents/{document_id}/parse`：手动触发文档解析、分块、本地 Embedding 和向量入库。
- `DELETE /api/documents/{document_id}`：删除文档并级联删除 chunk 和向量。

## Upload

- `POST /api/upload/file`：上传 Word、Excel、文本型 PDF，创建待解析文档记录；同一知识库内同名文件会替换旧记录并级联清理旧 chunk。
- `POST /api/upload/link`：导入公开链接记录，创建待解析文档记录；仅接受非空 `http/https` 链接，同一知识库内重复链接会替换旧记录。飞书链接支持 `docx`、旧版 `doc/docs`、`wiki` 文档节点、`sheets` 电子表格和 `base/bitable` 多维表格，解析时通过飞书 OpenAPI 获取文本或表格内容后再分块入库。

## Feishu Link Parsing

- 环境变量：推荐使用 `FEISHU_APP_ID`、`FEISHU_APP_SECRET`；同时兼容本地 `.env` 中的 `App_ID`、`App_App Secret`。
- 解析链路：链接入库创建待解析记录；点击解析后执行飞书 tenant token 获取、资源 token 识别、文档纯文本或表格行数据拉取、分块、本地 Embedding 和向量写入。
- 表格支持：电子表格读取 sheet 列表和单表 values；多维表格读取 table 列表和 records，并将字段名与单元格值转为可检索文本。
- 失败提示：未配置飞书密钥、应用无文档权限、文档内容为空或链接类型不支持时，会返回解析失败原因。

## Chat

- `POST /api/chat/stream`：SSE 流式问答。
- 请求支持 `session_id`；为空时后端自动创建会话，返回的 `metadata/done` 事件包含 `session_id`。
- 问答完成后保存用户问题和助手回答到 `chat_messages`，助手消息同步保存本次召回引用。
- 流程类问题要求模型返回文字说明和 `mermaid` 代码块，节点不超过 10 个。

## Sessions

- `GET /api/sessions`：兼容聊天页的数组接口，按权限返回最近 50 条会话，每条 `qa_round_count` 来自已持久化的 `chat_sessions.round_count`。超级管理员全量，部门管理员本部门及子部门，普通用户仅本人。与新历史接口和会话详情共用 DataScope。
- `POST /api/sessions`：创建会话，请求体包含 `knowledge_base_id` 和可选 `title`。
- `GET /api/sessions/{session_id}`：读取会话详情和消息列表。

### 分页历史与筛选

- `GET /api/qa-history`：返回 `{items, total, page, page_size}`。每项为 `id,title,user_id,user_name,org_id,org_name,dept_id,dept_name,kb_id,kb_name,round_count,created_at,updated_at`，ID 均为 UUID 字符串。
- 参数：`keyword`（最多 200 字）、`org_id`、`dept_id`、`kb_id`、`user_id`、`start_time`、`end_time`、`sort_by=updated_at|round_count`、`sort_order=asc|desc`、`page>=1`、`page_size=1..100`（默认 20）。默认更新时间倒序；相同排序值按会话 ID 稳定排序。关键词匹配标题、用户姓名/姓名快照、用户名、知识库名称和提问原文，`%`/`_` 按普通字符处理。时间筛选针对更新时间，使用带时区 ISO 8601，边界包含；倒置时间或非法参数返回 422。
- 后端强制范围：`super_admin` 全量并可筛选全部字段；`dept_admin` 强制当前组织内本部门及递归子部门，忽略传入的组织/部门筛选；`user` 强制本人，忽略组织/部门/用户筛选。部门管理员筛选范围外用户返回 403；用户调岗后原部门内有其历史的管理员仍可筛选该历史作者。非超管筛选无权限知识库返回 403。
- `GET /api/qa-history/filter-options?org_id=...`：返回 `{organizations, departments, knowledge_bases, users}`，每项至少 `{id,name}`。超管可按组织联动部门；部门管理员不返回组织，返回本部门树、可见知识库及本部门当前用户/历史作者；普通用户仅返回可见知识库。选项每次从数据库按权限生成，不缓存。知识库包含权限范围内禁用库，便于审计；不会因此开放新问答权限。
- 会话创建使用提问用户的组织、部门及姓名快照。每轮流结束后，两条消息、`round_count + 1` 和更新时间同事务提交；新增轮数使用 SQL 原子增量。切换知识库或用户调岗后再次提问创建新会话，旧会话快照不变。查看他人会话仅用于审计，不允许代其继续问答或删除。
- 部门 `POST /api/departments` / `PUT /api/departments/{id}` 支持可选 `parent_id`（UUID/null）；更新不传则保留原层级。只有超级管理员可调整层级；拒绝跨组织父级、自身或子孙部门作为父级、归档父级。为保留审计归属，不允许跨组织移动已有部门。历史审计递归范围包含归档部门。
- 部署前执行迁移 `20260924_0402`。迁移按现存 assistant 消息回填轮数，并将旧的知识库组织归属一次性修正为作者当前组织/部门。旧调岗时点和旧会话被覆盖前的知识库无法可靠还原，详见 `docs/history_upgrade.md`。
- `DELETE /api/sessions/{session_id}`：仅允许删除本人会话及其消息，审计他人会话不能删除（403）。

## DeepSeek

- 后端通过 OpenAI 兼容接口调用 DeepSeek：`{DEEPSEEK_BASE_URL}/chat/completions`。
- 可选环境变量：`DEEPSEEK_REASONING_EFFORT`、`DEEPSEEK_THINKING_ENABLED`，用于透传官方示例中的推理强度和 thinking 参数。
- 若后端返回 `ConnectError`，说明本机后端进程无法连接 DeepSeek API 地址，需先处理网络、代理或防火墙放行。

## Processes

- `GET /api/processes`：按权限列出流程定义。
- `POST /api/processes`：管理员创建流程定义。
