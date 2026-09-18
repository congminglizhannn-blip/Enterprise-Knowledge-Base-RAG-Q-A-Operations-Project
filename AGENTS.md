# AGENTS.md

## 项目定位

本项目是企业知识库 RAG 问答系统，面向作品集展示和小范围内部试用。系统支持多角色登录、部门隔离、知识库管理、文档上传、飞书链接导入、文档解析、分块向量化、DeepSeek 流式问答、引用溯源、流程类问题可视化和对话历史持久化。

代码根目录：

`F:\求职\产品\企业知识库 RAG 问答系统运营项目\Enterprise-Knowledge-Base-RAG-Q-A-Operations-Project`

资料与产物目录：

`F:\求职\产品\企业知识库 RAG 问答系统运营项目`

## 技术栈

- 前端：TypeScript、React、Next.js、Tailwind CSS
- 后端：Python、FastAPI、SQLAlchemy、Alembic
- 数据库：PostgreSQL、pgvector
- 文件存储：本地文件系统，后续可替换为 MinIO
- Embedding：`sentence-transformers/all-MiniLM-L6-v2`，384 维，本地 CPU；本地无模型缓存时允许确定性 fallback 保障演示可运行
- 大模型：DeepSeek API，OpenAI 兼容接口
- 流式输出：SSE
- 部署与依赖：Docker Compose、`.venv`、`requirements.txt`

## 绝对安全规则

- 禁止把任何 API Key、App Secret、Token、数据库密码写入 `AGENTS.md`、README、接口文档、源码或可提交文件。
- 所有密钥只允许放在本地 `.env`，并确保 `.env` 被 `.gitignore` 忽略。
- 示例文件只能使用占位符，如 `sk-xxxxx`、`cli_xxxxx`、`xxxxx`。
- 如果用户在聊天或文档中贴出了密钥，不能在回复中复述密钥值；应提醒用户后续轮换。
- 不把 AI 写成项目作者、贡献者或协作者。

## 本地开发环境规则

- 开发优先使用本地 VSCode。
- Python 后端必须使用项目内 `.venv`，首次创建命令：

```powershell
python -m venv --prompt=EKBRQAO .venv
```

- Python 依赖必须记录到 `backend/requirements.txt`。
- 后端启动推荐命令：

```powershell
cd "F:\求职\产品\企业知识库 RAG 问答系统运营项目\Enterprise-Knowledge-Base-RAG-Q-A-Operations-Project\backend"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

- 前端启动推荐命令：

```powershell
cd "F:\求职\产品\企业知识库 RAG 问答系统运营项目\Enterprise-Knowledge-Base-RAG-Q-A-Operations-Project\frontend"
npm run dev -- --hostname 127.0.0.1 --port 3000
```

- 注意 FastAPI 入口是 `app.main:app`，不是 `main:app`。
- 开发涉及删除项目根目录以外文件时，必须先询问用户。

## 软件安装规范

- 所有新软件统一安装到 `F:\1111111softsmome\`。
- 每个软件独立子目录，如 Docker 使用 `F:\1111111softsmome\Docker\`。
- 软件本体、配置、缓存、运行时数据尽量自包含在该目录内。
- AI 不自动设置系统环境变量，只能输出明确步骤让用户手动配置。
- 只有在权限不足、跨用户共享或服务启动需要时，才提出权限调整建议。

## 环境变量规范

后端 `.env` 至少包含：

```env
DATABASE_URL=postgresql+psycopg://postgres:password@localhost:5433/rag_db
POSTGRES_PASSWORD=password
DEEPSEEK_API_KEY=sk-xxxxx
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_REASONING_EFFORT=
DEEPSEEK_THINKING_ENABLED=false
SECRET_KEY=change-me-in-production
UPLOAD_DIR=./uploads
EMBEDDING_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_DIMENSION=384
FEISHU_APP_ID=cli_xxxxx
FEISHU_APP_SECRET=xxxxx
```

兼容历史变量名：

- `App_ID` 可映射为飞书 App ID
- `App_App Secret` 可映射为飞书 App Secret，但不推荐继续使用，因为变量名中包含空格

## 前后端联调原则

- 不以“页面显示后端已连接”作为联调成功依据，必须逐接口验证真实数据链路。
- 每次联调至少确认四层状态：
  - 服务是否监听端口：`netstat -ano | findstr :3000`、`netstat -ano | findstr :8000`
  - 健康检查是否可用：`GET /api/health`
  - 依赖数据库的接口是否可用：`POST /api/auth/login`、`GET /api/kbs`
  - 业务闭环是否可用：上传、解析、文档列表、问答、引用、历史
- 端口占用时先查 PID，不盲目启动重复服务。
- 后端代码改动后，如果不是 `--reload` 启动，必须重启 Uvicorn。
- `.env` 改动后必须重启后端进程，否则配置不会生效。
- VSCode、Codex 终端、系统 PowerShell 的网络权限和环境变量可能不同；涉及外部 API 时必须在实际启动后端的同一终端中验证。

## 数据库与数据状态原则

- PostgreSQL/pgvector 是核心依赖，不能只看 FastAPI 健康检查。
- `/api/health` 不访问数据库，只能说明 FastAPI 活着，不能说明登录、知识库、RAG 可用。
- 数据库不可用时，依赖数据库的接口会失败；应设置数据库连接超时，避免接口长时间假死。
- 使用 Docker pgvector 时要确认容器和端口：

```powershell
docker ps
netstat -ano | findstr :5433
```

- 如果本机 5432 有普通 PostgreSQL，但没有 `vector` 扩展，不能直接替代 pgvector 数据库。
- 涉及数据库结构变更必须同步 Alembic migration。
- 如果已有表结构能满足需求，优先复用已有表，避免无意义 migration。
- 清理脏数据前必须确认范围，只清理明确由联调产生的无效数据。

## 文档入库链路原则

正确链路：

```text
上传或导入链接 -> 创建待解析文档 -> 手动解析 -> 文本提取 -> 分块 -> Embedding -> 写入 document_chunks -> 回写文档状态与 chunk_count -> 前端刷新统计
```

- 上传不等于解析完成，不能让前端误显示为已入库。
- 解析按钮必须调用真实后端接口，不能只改前端状态。
- 解析完成后必须确认数据库中 `documents.chunk_count` 和 `document_chunks` 实际数量一致。
- 同一知识库内同名文件再次上传时，应替换旧文档并级联删除旧 chunk，避免重复文件污染检索。
- 重复解析同一文档前，必须先清理该文档旧 chunk，再写入新 chunk。
- 空链接、非法 URL、不可访问页面、解析结果为空时，应明确失败，不允许生成空 chunk。
- 第一版 PDF 仅支持文本型 PDF；扫描件应返回友好提示。

## RAG 检索原则

- 问答请求必须携带当前 `knowledge_base_id`。
- 后端检索必须在 SQL 层过滤：`knowledge_base_id`、`department_id` 和当前用户权限。
- 任何无权限 chunk 都不能进入 prompt。
- 引用来源只能来自本次检索命中的 chunk，不能用“当前知识库所有文件”兜底。
- 右侧引用区没有命中时，应显示“未命中相关片段”，而不是展示静态假数据。
- 本地 embedding fallback 只用于演示可运行，不代表真实语义检索质量；上线前应下载或部署真实 embedding 模型。
- 检索结果应至少返回文档名称、原文片段、chunk_id、document_id，便于前端点击查看溯源。

## DeepSeek 调用原则

- 后端使用 OpenAI 兼容接口：`{DEEPSEEK_BASE_URL}/chat/completions`。
- `DEEPSEEK_BASE_URL` 推荐填写 `https://api.deepseek.com`。
- 若模型需要推理参数，通过环境变量控制：`DEEPSEEK_REASONING_EFFORT=high`、`DEEPSEEK_THINKING_ENABLED=true`。
- DeepSeek 调用失败时要区分 Key 未配置、网络不可达、模型名或参数错误。
- 外部 API 调用必须设置连接和读取超时，避免前端一直显示“正在检索”。
- 如果浏览器或 VSCode 能访问 DeepSeek，但后端不能访问，应确认后端进程是在哪个终端启动的。

## SSE 流式输出原则

- 前端解析 SSE 时必须兼容 `\n\n` 和 `\r\n\r\n`。
- 前端应处理流结束时残留 buffer，避免最后一段内容不显示。
- 后端 SSE 建议先返回 `metadata`，包括 `session_id`、`citations`、`is_flow_question`。
- `delta` 事件只承载增量文本。
- `done` 事件返回最终 `session_id` 和 citations，便于前端保存状态。
- 前端不能因为 metadata 已返回就认为回答完成，必须继续消费 delta。

## 登录态与对话历史原则

- 登录成功后，前端可在 MVP 阶段将 Access Token、Refresh Token 和用户信息存入 `localStorage`。
- 当前双令牌方案仅适合作品集展示和本地演示：Access Token 默认 24 小时，Refresh Token 默认 7 天，Refresh Token 为无状态 JWT。
- 前端收到 401 时，应先调用 `/api/auth/refresh` 刷新 token 并重试原请求；刷新失败后再清理本地状态并回到登录页。
- Access Token 和 Refresh Token 必须通过 `type` 字段区分；Refresh Token 不能访问业务接口。
- 上线前必须升级 Refresh Token 安全机制：Refresh Token 不应继续放在 `localStorage`，应改用 `httpOnly`、`Secure`、`SameSite` Cookie。
- 上线前必须让 Refresh Token 服务端可撤销：建议落库保存 token 标识、用户、设备、过期时间、轮换状态和吊销状态；退出登录、密码变更、异常登录时能吊销。
- 上线前必须实现 Refresh Token 轮换和重放检测：每次刷新后旧 Refresh Token 失效，重复使用旧 token 应触发安全告警或强制重新登录。
- 上线前需要补充多设备会话管理、主动退出登录接口、过期清理任务和认证审计日志。
- 页面刷新时，前端必须读取 token 并调用 `/api/auth/me` 校验，通过后再恢复登录态。
- token 刷新失败或认证信息缺失时必须清理本地状态并回到登录页。
- 退出登录必须清理 `auth_token`、`refresh_token`、`user_info`、当前消息缓存和当前会话 ID。
- 对话历史应优先存后端数据库，而不是只存 localStorage。
- 问答时如果没有 `session_id`，后端自动创建会话；回答完成后保存用户消息和助手消息。
- 历史会话列表必须来自后端 `/api/sessions`，不能使用静态 mock。

## 前端交互原则

- 业务按钮必须有真实动作或明确禁用，不能做静态假按钮。
- 文档列表、引用来源、历史会话等业务数据必须来自后端真实接口。
- 文件详情、引用来源应可点击打开详情，至少展示文档状态、chunk 数和 chunk 预览。
- 问答页面布局应采用固定视口高度和内部滚动：
  - 页面整体 `overflow: hidden`
  - 顶部栏和输入区 `flex-shrink: 0`
  - 对话区独立 `overflow-y: auto`
  - 引用区独立 `overflow-y: auto`
  - 新消息到达自动滚动到对话底部
- 不使用 `position: fixed` 粘住输入框，优先用 Flex 布局实现。
- UI 风格保持简约、浅蓝色低饱和。

## 飞书链接接入原则

- 第一版支持飞书文档链接解析，不直接做完整飞书企业知识库同步。
- 支持飞书新版文档、旧版文档和 Wiki 文档节点。
- 飞书链接上传只创建待解析记录，点击解析时再调用飞书 OpenAPI 获取纯文本。
- 飞书 App 必须具备目标文档访问权限，否则应返回明确失败原因。
- 解析结果为空时不能入库。
- 飞书密钥只允许放 `.env`。

## API 与文档同步规则

- 涉及 API 新增、变更、请求体或返回体变化，必须更新 `docs/api_reference.md`。
- 涉及 RAG 逻辑变化，必须补充或更新最小测试。
- 涉及数据库结构变化，必须同步 Alembic migration。
- 涉及前端关键交互变化，必须跑 `npm run build`。
- 涉及后端服务逻辑变化，必须跑后端测试。

## 协作与需求澄清原则

- 不要在业务语义还模糊时直接进入实现。开发前必须确认关键动词的含义，例如“上传”是否等于“解析入库”、“解析”是否同步触发 embedding、“引用来源”是检索命中文档还是知识库文件列表。
- 后端开发前必须把端到端业务链路写清楚，并按链路验收，而不是只验证单个接口。RAG 类项目至少要覆盖：上传、解析、分块、向量写入、计数回写、知识库过滤、检索召回、prompt 构造、模型输出、引用展示、历史保存。
- 遇到“页面没反应”时，要按层拆解：前端事件是否触发、请求是否发出、接口是否返回、数据库是否可用、外部 API 是否可达、流式协议是否被正确解析。
- 对数据状态要保持敏感。重复上传、重复解析、失败任务、空链接、测试数据和历史脏数据都可能污染后续判断；开发时必须设计去重、替换、失败回写和清理策略。
- 不要把健康检查等同于系统可用。`/api/health` 只能说明服务进程存在，不能说明数据库、pgvector、外部模型、对象存储或业务链路可用。
- 外部 API 问题要优先确认运行环境。用户浏览器、VSCode 终端、Codex 终端和后端实际启动进程可能处在不同网络权限、代理或环境变量下；必须在实际运行后端的同一终端中验证连通性。
- 当用户补充了官方示例代码、模型参数或运行方式时，要尽快对齐实现，不要继续用默认假设。尤其是大模型接口中的 `base_url`、模型名、流式格式、额外参数和超时策略。
- 前端兜底展示必须谨慎。不能为了避免空白而展示 mock 数据或不相关数据；业务系统中“空状态”比“假数据”更安全。
- 用户侧信息不完整时，应主动询问最少但关键的问题：运行环境、数据库端口和扩展、外部 API 调用方式、产品验收口径、是否允许清理历史脏数据。
- 每次修复后要把问题归类为代码问题、配置问题、服务问题、网络问题或数据问题，并把对应经验沉淀回本文件。

## 验证清单

每次重要修改完成后，至少执行：

```powershell
cd "F:\求职\产品\企业知识库 RAG 问答系统运营项目\Enterprise-Knowledge-Base-RAG-Q-A-Operations-Project\backend"
.\.venv\Scripts\python.exe -m pytest tests
```

```powershell
cd "F:\求职\产品\企业知识库 RAG 问答系统运营项目\Enterprise-Knowledge-Base-RAG-Q-A-Operations-Project\frontend"
npm run build
```

联调时建议额外验证：

- 登录接口返回 200
- 知识库列表能返回真实数据
- 文档上传后状态为待解析
- 点击解析后状态为解析完成且 chunk_count > 0
- 问答请求携带当前 knowledge_base_id
- SSE 能收到 metadata、delta、done
- 右侧引用只显示本次命中的文档
- 刷新页面后登录态和历史会话可恢复

## 输出要求

- 每次开发前先说明修改范围。
- 开发中遇到环境问题要区分代码问题、配置问题、服务问题、网络问题和数据问题。
- 不重构无关代码。
- 不隐藏已知风险。
- 最终回复必须说明修改内容、验证结果和仍需用户处理的环境事项。

## 前端迁移阶段提交规则

- 已建立 `baseline-after-stage-6b` 作为 Stage 3-6b 工作区基线。
- 从 Stage 6a 开始，恢复“每步单独提交、单独验收、单独可回滚”的执行方式。
- 每步提交前必须先执行 `git status`，确认工作区干净或仅包含当前阶段文件。
- 每次 commit 后打对应阶段 tag，例如 `stage-6a-done`、`stage-5a-done`、`stage-5b-done`。
- 未建立当前阶段基线或工作区不干净时，不允许继续 Stage 7 路由拆分。
