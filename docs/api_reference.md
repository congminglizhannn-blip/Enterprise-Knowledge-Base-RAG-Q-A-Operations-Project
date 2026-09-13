# API Reference

## Auth

- `POST /api/auth/login`：账号密码登录，返回 JWT。
- `POST /api/auth/refresh`：使用 Refresh Token 换取新的 Access Token 和 Refresh Token。
- `GET /api/auth/me`：获取当前用户信息。
- 本地演示默认 Access Token 有效期为 24 小时，可通过 `ACCESS_TOKEN_EXPIRE_MINUTES` 调整；Refresh Token 默认有效期为 7 天，可通过 `REFRESH_TOKEN_EXPIRE_MINUTES` 调整。
- 前端收到 401 会先调用刷新接口并重试原请求；刷新失败后才清理本地登录态并提示重新登录。

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
