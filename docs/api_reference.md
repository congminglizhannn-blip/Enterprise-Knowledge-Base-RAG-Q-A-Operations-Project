# API Reference

## Auth

- `POST /api/auth/register`：注册账号；可创建新组织，或使用邀请码加入已有组织；成功后创建服务端 session，并通过 `Set-Cookie: session_token=...` 写入 httpOnly cookie。
- `POST /api/auth/login`：账号密码登录；成功后创建服务端 session，并通过 `Set-Cookie: session_token=...` 写入 httpOnly cookie。兼容期仍返回 Access Token 和 Refresh Token，旧前端可继续使用 Bearer Token。
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
- `GET /api/admin/departments`：管理员查看部门列表。
- `POST /api/admin/users/{user_id}/reset-password`：超级管理员重置本组织用户密码，需携带 `X-CSRF-Token`；接口会撤销该用户所有旧 session，并标记 `must_change_password=true`。

## Knowledge Bases

- `GET /api/kbs`：按当前用户权限列出知识库。
- `POST /api/kbs`：管理员创建知识库。

## Documents

- `GET /api/documents?knowledge_base_id=...`：按知识库列出文档。
- `GET /api/documents/{document_id}`：查看文档详情和前 8 个 chunk 预览。
- `POST /api/documents/{document_id}/parse`：手动触发文档解析、分块、本地 Embedding 和向量入库。
- `DELETE /api/documents/{document_id}`：删除文档并级联删除 chunk 和向量。

## Upload

- `POST /api/upload/file`：上传 Word、Excel、文本型 PDF，创建待解析文档记录；同一知识库内同名文件会替换旧记录并级联清理旧 chunk。
- `POST /api/upload/link`：导入公开链接记录，创建待解析文档记录；仅接受非空 `http/https` 链接，同一知识库内重复链接会替换旧记录。飞书链接支持 `docx`、旧版 `doc/docs` 和 `wiki` 文档节点，解析时通过飞书 OpenAPI 获取纯文本内容后再分块入库。

## Feishu Link Parsing

- 环境变量：推荐使用 `FEISHU_APP_ID`、`FEISHU_APP_SECRET`；同时兼容本地 `.env` 中的 `App_ID`、`App_App Secret`。
- 解析链路：链接入库创建待解析记录；点击解析后执行飞书 tenant token 获取、文档 token 识别、纯文本拉取、分块、本地 Embedding 和向量写入。
- 失败提示：未配置飞书密钥、应用无文档权限、文档内容为空或链接类型不支持时，会返回解析失败原因。

## Chat

- `POST /api/chat/stream`：SSE 流式问答。
- 请求支持 `session_id`；为空时后端自动创建会话，返回的 `metadata/done` 事件包含 `session_id`。
- 问答完成后保存用户问题和助手回答到 `chat_messages`，助手消息同步保存本次召回引用。
- 流程类问题要求模型返回文字说明和 `mermaid` 代码块，节点不超过 10 个。

## Sessions

- `GET /api/sessions`：按当前用户列出最近 50 条会话。
- `POST /api/sessions`：创建会话，请求体包含 `knowledge_base_id` 和可选 `title`。
- `GET /api/sessions/{session_id}`：读取会话详情和消息列表。
- `DELETE /api/sessions/{session_id}`：删除当前用户可访问的会话及其消息。

## DeepSeek

- 后端通过 OpenAI 兼容接口调用 DeepSeek：`{DEEPSEEK_BASE_URL}/chat/completions`。
- 可选环境变量：`DEEPSEEK_REASONING_EFFORT`、`DEEPSEEK_THINKING_ENABLED`，用于透传官方示例中的推理强度和 thinking 参数。
- 若后端返回 `ConnectError`，说明本机后端进程无法连接 DeepSeek API 地址，需先处理网络、代理或防火墙放行。

## Processes

- `GET /api/processes`：按权限列出流程定义。
- `POST /api/processes`：管理员创建流程定义。
