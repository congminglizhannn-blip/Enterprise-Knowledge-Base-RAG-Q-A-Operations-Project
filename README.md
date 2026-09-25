# 企业知识库 RAG 问答系统

本项目是一个面向企业内部知识沉淀、文档检索和智能问答的 RAG 系统，支持多角色登录、组织与部门隔离、知识库管理、文档上传与链接导入、文档解析入库、向量检索、DeepSeek 流式问答、引用溯源、流程类问题可视化和问答历史审计。

项目当前用于作品集展示和小范围内部试用，重点展示从“资料入库”到“可追溯问答”的完整业务闭环。

## 目录

- [项目简介](#项目简介)
- [复现方式](#复现方式)
- [上线可视化链接](#上线可视化链接)
- [业务流程](#业务流程)
- [功能架构](#功能架构)
- [简单上手系统](#简单上手系统)
- [详细接口](#详细接口)
- [技术栈](#技术栈)

## 项目简介

企业中的制度、流程、产品资料和项目文档通常分散在本地文件、在线文档和不同部门知识库中。传统搜索只能返回文档列表，无法直接回答具体业务问题，也难以说明答案来源。

本系统围绕 RAG 问答链路设计：

1. 用户按角色登录系统。
2. 管理员创建组织、部门和知识库。
3. 用户上传 Word、Excel、文本型 PDF，或导入公开链接、飞书文档链接。
4. 系统解析文档内容，切分文本片段，生成 384 维向量并写入 PostgreSQL + pgvector。
5. 用户在指定知识库内提问，后端按组织、部门和知识库权限过滤可检索内容。
6. 系统召回相关片段，构造 Prompt，调用 DeepSeek OpenAI 兼容接口进行流式回答。
7. 前端展示答案、引用来源、命中文档片段，并保存问答历史。

系统适合演示以下能力：

- 企业知识库从上传、解析、分块、向量化到问答的完整闭环。
- 多角色权限控制与部门隔离。
- SSE 流式问答体验。
- 引用溯源与历史会话审计。
- 流程类问题的 Mermaid 可视化输出。

## 复现方式

以下步骤以 Windows PowerShell 为例，默认项目目录为克隆后的仓库根目录：

```powershell
Enterprise-Knowledge-Base-RAG-Q-A-Operations-Project
```

### 1. 下载项目
#### 方式a.clone

```powershell
git clone https://github.com/congminglizhannn-blip/Enterprise-Knowledge-Base-RAG-Q-A-Operations-Project.git
cd "Enterprise-Knowledge-Base-RAG-Q-A-Operations-Project"
```
#### 方式b.右上角下载zip压缩包
下载压缩包，解压后进入项目根目录即可。
![zip下载方法](screenshot/downloadzip.png)

### 2. 启动项目

#### 2.1 安装软件

启动前请先确认本地已安装：

- Git
- Docker Desktop
- Python 3.12+
- Node.js 22+

如需手动配置环境变量，可通过以下入口进入配置页：

```text
Win + R -> 输入 sysdm.cpl -> 高级 -> 环境变量
```

建议在“用户变量”的 `Path` 中追加对应软件的 `bin` 或可执行文件目录。修改后需要重启 PowerShell。

本章节大概安装如下路径进行：数据库→后端→前端
![章节路径](screenshot/chapter.png)

#### 2.2 （数据库）Docker 数据库启动

项目使用 Docker 中的 PostgreSQL + pgvector 作为数据库。启动顺序建议按 **"开启 Docker → 检查容器是否存在 → 启动容器并设置自启动"** 执行。

- **开启 Docker**
  - 首先打开 Docker Desktop
  - 并在 PowerShell 中确认 Docker 可用：

    ```powershell
    docker info
    ```

- **检查容器是否存在**
  - 检查数据库容器是否已经存在：

    ```powershell
    docker ps -a --filter "name=ekbrqao-postgres"
    ```

  - 如果**没有看到** `ekbrqao-postgres`，先通过项目提供的 `docker-compose.yml` 创建并启动数据库容器：

    ```powershell
    cd "Enterprise-Knowledge-Base-RAG-Q-A-Operations-Project"
    docker compose up -d postgres
    ```

  - 如果**容器已经存在但未运行**，启动它：

    ```powershell
    docker start ekbrqao-postgres
    ```

- **设置自启动**
  - 设置容器随 Docker 自动启动：

    ```powershell
    docker update --restart unless-stopped ekbrqao-postgres
    ```

- **确认运行状态**
  - 最后确认容器运行状态和端口监听：

    ```powershell
    docker ps --filter "name=ekbrqao-postgres"
    netstat -ano | findstr :5433
    ```

- **默认数据库连接信息**

  ```text
  Host: 127.0.0.1
  Port: 5433
  Database: rag_db
  User: postgres
  Password: password
  ```

#### 2.3 （后端）后端依赖安装、环境变量配置和后端启动

##### 2.3.1 安装后端依赖

```powershell
cd backend
python -m venv --prompt=EKBRQAO .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

##### 2.3.2 配置后端环境变量

进入后端目录：

```powershell
cd backend
```

创建 `.env`：

```powershell
Copy-Item ..\.env.example .env
```

建议将 `backend/.env` 调整为以下格式：

```env
DATABASE_URL=postgresql+psycopg://postgres:password@localhost:5433/rag_db
POSTGRES_PASSWORD=password
DEEPSEEK_API_KEY=sk-xxxxx
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_REASONING_EFFORT=
DEEPSEEK_THINKING_ENABLED=false
SECRET_KEY=change-me-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=1440
REFRESH_TOKEN_EXPIRE_MINUTES=10080
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=10
CORS_ORIGINS=["http://127.0.0.1:3000"]
EMBEDDING_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_DIMENSION=384
INITIAL_ADMIN_USERNAME=Admin
INITIAL_ADMIN_PASSWORD=7777
FEISHU_APP_ID=cli_xxxxx
FEISHU_APP_SECRET=xxxxx
```

注意：

- 真实 API Key、App Secret、Token、数据库密码不要提交到 Git。
- `.env` 只保存在本地，仓库中只能保留占位符。
- 修改 `.env` 后必须重启后端进程。

##### 2.3.3 执行数据库结构迁移

```powershell
.\.venv\Scripts\alembic.exe upgrade head
```

如果是空库演示，可以初始化默认组织、部门、管理员和默认知识库：

```powershell
.\.venv\Scripts\python.exe scripts_init_admin.py
```

默认管理员：

```text
用户名：Admin
密码：7777
角色：超级管理员
```
登录时角色选项要选择对应的角色，否则无法登入

##### 2.3.4 导入数据库演示数据（可选）

搭建过程测试建立了一些用户、进行了对应操作产生了一些数据，如果有需求使用历史数据，数据已经在根目录中放置： `rag_db.sql`，可将它导入 Docker 数据库。

###### (1)文件位置：

```text
./rag_db.sql
```

###### (2)历史数据内的已创建账户：
| 用户名称 | 密码 | 角色 |
| -------- | -------- | ------- |
| Admin（默认就有）     | 7777 | 超级管理员 |
| 1a     | 1a1a1a1a1a | 超级管理员 |
| 1b     | 1b1b1b1b | 普通用户 |
登录时角色选项要选择对应的角色，否则无法登入

###### (3)推荐导入命令：

```powershell
cd "Enterprise-Knowledge-Base-RAG-Q-A-Operations-Project"
docker cp .\rag_db.sql ekbrqao-postgres:/tmp/rag_db.sql
docker exec -i ekbrqao-postgres psql -U postgres -d rag_db -f /tmp/rag_db.sql
```

如果 `rag_db.sql` 是完整库备份且包含建表语句，建议先确认是否需要清空旧库，避免演示数据重复。清库属于破坏性操作，请只在确认不需要保留本地数据时执行。

##### 2.3.5 启动后端

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

后端检查：

```text
http://127.0.0.1:8000/api/health
http://127.0.0.1:8000/docs
```

`/api/health` 只能说明 FastAPI 进程存活，不代表数据库、DeepSeek 或 RAG 业务链路全部可用。

#### 2.4 （前端）前端依赖安装和启动

新开一个 PowerShell：
##### 2.4.1 切换到对应目录安装依赖

```powershell
# 切换目录
cd frontend
# 安装依赖
npm install
```
##### 2.4.2 启动前端

```powershell
npm run dev
```

##### 2.4.3 访问

```text
http://127.0.0.1:3000
```

前端默认通过 Next.js rewrites 将 `/api/*` 代理到：

```text
http://127.0.0.1:8000/api/*
```

如需修改后端代理地址，可在启动前设置：

```powershell
$env:API_PROXY_TARGET="http://127.0.0.1:8000"
npm run dev -- --hostname 127.0.0.1 --port 3000
```
**至此，前后端均被启动，可以通过前端进行访问系统平台**
#### 2.5 可选：Docker Compose 一键启动方式

也可以使用 Docker Compose 同时启动数据库、后端和前端：

```powershell
cd "Enterprise-Knowledge-Base-RAG-Q-A-Operations-Project"
docker compose up --build
```

开发阶段更推荐本地启动前后端、Docker 只运行数据库，便于查看日志、调试接口和重启服务。

## 可视化链接

本项目通过 ngrok 将本地前端页面临时暴露为公网演示地址，预计2026.09-2027.05节假日除外的工作日 每日早上在如下链接网页内更新系统链接
，链接可访问的时间为：8:00~23:00

https://uselink.app/@lcm/link-update-for-enterprise-rag-q-a-system-30gg672b

## 业务流程
### 0.整体业务流程图

<details>
<summary>点击展开查看整体业务流程图</summary>

```mermaid
flowchart TD
  Start([用户进入系统]) --> Auth{登录态是否有效}
  Auth -- 否 --> Login[登录 / 注册]
  Login --> RoleCheck{角色校验是否通过}
  RoleCheck -- 否 --> RoleError[提示角色不一致或认证失败\n不创建 session]
  RoleCheck -- 是 --> MustPwd{是否需要强制改密}
  MustPwd -- 是 --> ChangePwd[修改密码并重签 session]
  MustPwd -- 否 --> Shell[进入业务布局]
  ChangePwd --> Shell
  Auth -- 是 --> Restore[调用 /api/auth/me]
  Restore --> RestoreOK{登录态恢复是否完成}
  RestoreOK -- 否 --> RestoreFail[提示登录态失效\n清理本地认证信息]
  RestoreOK -- 是 --> Shell

  Shell --> KbManage[知识库管理]
  KbManage --> KbStatus{知识库是否启用}
  KbStatus -- 否 --> KbDisabled[保留文档 / 向量 / 历史\n业务访问返回 409]
  KbStatus -- 是 --> Ingestion[文档入库]

  Ingestion --> Upload[上传文件或导入链接]
  Upload --> Pending[创建待解析文档\nstatus=pending]
  Pending --> SortTop[列表按 created_at desc, id desc\n新文档置顶]
  Pending --> Parse[手动点击解析]
  Parse --> Extract{文本提取是否成功}
  Extract -- 否 --> Failed[状态 failed\n显示失败原因]
  Extract -- 是 --> Chunk[分块]
  Chunk --> Embed[本地 Embedding]
  Embed --> Vector[写入 document_chunks + pgvector]
  Vector --> Completed{chunk 写入与计数回写是否完成}
  Completed -- 否 --> Failed
  Completed -- 是 --> DocReady[状态 completed\n可参与检索]

  Shell --> Chat[问答工作台]
  Chat --> SelectKb{知识库是否已选择}
  SelectKb -- 否 --> SelectHint[提示先选择知识库]
  SelectKb -- 是 --> SessionReady{会话是否已准备}
  SessionReady -- 否 --> NewSession[新增本人空会话]
  NewSession --> Ask[输入问题]
  SessionReady -- 是 --> Ask
  Chat --> Ask
  Ask --> AccessCheck{知识库与部门权限是否通过}
  AccessCheck -- 否 --> AccessDenied[拒绝问答并提示无权限]
  AccessCheck -- 是 --> Retrieve[SQL 权限过滤 + 向量检索]
  Retrieve --> HitCheck{是否命中相关 chunk}
  HitCheck -- 否 --> EmptyCite[显示未命中相关片段]
  HitCheck -- 是 --> Cite[生成本次命中引用]
  EmptyCite --> Prompt[构造 Prompt]
  Cite --> Prompt
  Prompt --> DeepSeek[DeepSeek 流式生成]
  DeepSeek --> SSE{SSE 是否正常完成}
  SSE -- 否 --> StreamError[提示生成失败或网络异常]
  SSE -- 是 --> Save[保存用户问题 + 助手回答\nround_count + 1]
  Save --> FirstRound{首轮问答是否完成}
  FirstRound -- 是 --> Rename[默认标题改为首个问题]
  FirstRound -- 否 --> KeepTitle[保留标题]
  Rename --> History
  KeepTitle --> History

  Shell --> History[问答历史与审计]
  History --> ScopeReady{数据范围计算是否完成}
  ScopeReady -- 否 --> HistoryError[提示历史加载失败]
  ScopeReady -- 是 --> Scope[按角色生成后端 DataScope\n超管全量 / 部门管理员部门树 / 普通用户本人]
  Scope --> Filters[关键词 / 组织 / 部门 / 用户 / 知识库 / 时间]
  Filters --> Page[分页 + 排序 + round_count]

  Shell --> Eval[评估与验收闭环]
  Eval --> Tests[pytest / node tests / build]
  Eval --> RagCases[RAG 最小测试样例]
  Eval --> Checklist[验收清单]
```
</details>

### 1. 登录与权限

用户进入系统后选择角色并登录。后端会校验用户名、密码和角色是否匹配数据库记录。系统当前包含三类角色：

- 超级管理员：管理组织、部门、用户、知识库和全量历史审计。
- 部门管理员：管理本部门范围内的用户、知识库和历史数据。
- 普通用户：使用有权限的知识库进行问答，只查看本人会话。

### 2. 知识库管理

管理员创建知识库，并设置知识库归属范围。知识库可启用或禁用，禁用后保留文档和历史，但不能继续上传、解析或新建问答。

### 3. 文档入库

文档入库分为两个动作：

1. 上传或导入链接：只创建“待解析”文档记录。
2. 手动解析：提取文本、切分 Chunk、生成 Embedding、写入 `document_chunks`，并回写文档状态和 `chunk_count`。

支持的来源：

- Word 文档
- Excel 表格
- 文本型 PDF
- 公开网页链接
- 飞书新版文档、旧版文档、Wiki、电子表格和多维表格链接

### 4. RAG 问答

用户选择知识库后提问。后端会：

1. 校验用户是否有权访问当前知识库。
2. 按 `knowledge_base_id`、组织、部门和角色权限过滤可检索 Chunk。
3. 使用向量检索和关键词检索召回相关片段。
4. 将命中片段组装进 Prompt。
5. 调用 DeepSeek 流式接口。
6. 通过 SSE 返回 `metadata`、`delta`、`done` 事件。
7. 保存用户问题、助手回答和引用来源。

### 5. 引用溯源

右侧引用区只展示本次检索命中的片段，不使用静态假数据或知识库文件列表兜底。引用至少包含文档名称、片段内容、`chunk_id` 和 `document_id`。

### 6. 问答历史

系统会保存会话、消息、轮次和用户组织部门快照。历史页支持按关键词、组织、部门、知识库、用户、时间和轮次筛选。

## 功能架构

```text
用户界面层
├─ 登录/注册/改密
├─ 运营总览
├─ 知识库管理
├─ 文档入库
├─ 知识库问答
├─ 流程图问答
├─ 问答历史
└─ 系统管理

前端应用层（Next.js + React）
├─ AuthContext 登录态管理
├─ apiClient 统一请求、Cookie、CSRF 和错误处理
├─ chat stream SSE 解析
├─ 文档表格、引用面板、历史筛选组件
└─ Tailwind CSS 页面样式

后端 API 层（FastAPI）
├─ auth：登录、注册、刷新、登出、CSRF、改密、邀请码
├─ admin：用户管理、部门管理、密码重置、统计
├─ organizations / departments：组织与部门管理
├─ kbs：知识库管理
├─ upload / documents：上传、链接导入、解析、删除、详情
├─ chat：RAG 流式问答
├─ sessions / qa-history：会话与历史审计
└─ processes：流程定义

业务服务层
├─ parser：PDF、Office、网页链接、飞书链接解析
├─ chunker：文本分块
├─ embedding：本地 Embedding 与确定性 fallback
├─ retriever：权限过滤、向量召回、关键词召回
├─ chat_service：Prompt 构造、DeepSeek 调用、SSE 输出
└─ session_history：消息和引用持久化

数据层
├─ PostgreSQL
├─ pgvector
├─ Alembic migration
├─ 本地上传文件目录 backend/uploads
└─ 演示数据备份 rag_db.sql
```

## 简单上手系统

### 1. 登录

本地空库初始化后的默认账号：

```text
用户名：Admin
密码：7777
角色：超级管理员
```

如果使用 `rag_db.sql` 导入演示数据，请以数据文件中提供的演示账号为准。不要将真实生产账号密码写入公开仓库。

### 2. 创建或选择知识库

登录后进入“知识库管理”：

1. 查看已有知识库。
2. 如无可用知识库，创建一个新的知识库。
3. 确认知识库处于启用状态。

### 3. 上传文档

进入“文档入库”：

1. 选择目标知识库。
2. 上传 Word、Excel 或文本型 PDF。
3. 上传成功后，文档状态应为待解析。
4. 点击解析。
5. 解析完成后确认 `chunk_count > 0`。

注意：上传不等于入库完成，必须解析完成后才能被问答检索命中。

### 4. 导入链接

进入“文档入库”：

1. 选择目标知识库。
2. 输入公开 URL 或飞书文档链接。
3. 点击导入。
4. 点击解析。

飞书链接需要提前在 `backend/.env` 配置：

```env
FEISHU_APP_ID=cli_xxxxx
FEISHU_APP_SECRET=xxxxx
```

飞书应用还必须拥有目标文档访问权限。

### 5. 进行问答

进入“知识库问答”：

1. 选择目标知识库。
2. 输入问题。
3. 等待流式回答输出。
4. 查看右侧引用来源。
5. 在“问答历史”中查看已保存会话。

可尝试的问题类型：

- “请总结这份制度的核心要求。”
- “报销流程需要哪些步骤？”
- “如果新员工入职，应该先完成哪些事项？”
- “把这个流程用 Mermaid 画出来。”

## 详细接口

后端 api指南文档：
（使用的netlify，可能会提示是否继续访问，点击继续即可）
https://rag-api-guide.netlify.app/
![继续访问提示](screenshot/jxfw.png)

若本地启动后，可通过如下访问本地项目自带的api文档：
```text
http://127.0.0.1:8000/docs
```

仓库内接口文档：

```text
docs/api_reference.md
```

### 健康检查

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | FastAPI 进程健康检查 |

### 认证与会话

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/register` | 注册账号，可创建组织或使用邀请码加入组织 |
| POST | `/api/auth/login` | 登录，需提交用户名、密码和角色 |
| POST | `/api/auth/refresh` | 刷新 Access Token 和 Refresh Token |
| POST | `/api/auth/logout` | 登出并撤销当前服务端 session |
| GET | `/api/auth/me` | 获取当前登录用户 |
| GET | `/api/auth/csrf` | 获取 CSRF Token |
| POST | `/api/auth/change-password` | 修改密码 |
| POST | `/api/auth/invites` | 超级管理员创建邀请码 |
| GET | `/api/auth/invites` | 查看邀请码 |
| DELETE | `/api/auth/invites/{invite_id}` | 撤销邀请码 |
| GET | `/api/auth/invites/validate` | 校验邀请码 |
| GET | `/api/auth/sessions` | 查看当前用户登录 session |
| DELETE | `/api/auth/sessions/{session_id}` | 删除指定登录 session |

### 系统管理

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/admin/users` | 管理员查看用户列表 |
| GET | `/api/admin/departments` | 管理员查看部门列表 |
| GET | `/api/admin/stats` | 管理统计数据 |
| POST | `/api/admin/users/{user_id}/reset-password` | 超级管理员重置用户密码 |
| PUT | `/api/users/{user_id}/role` | 调整用户角色 |
| PATCH | `/api/users/{user_id}/status` | 启用或禁用用户 |

### 组织与部门

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/organizations` | 查看组织列表 |
| POST | `/api/organizations` | 创建组织 |
| PUT | `/api/organizations/{org_id}` | 编辑组织 |
| PATCH | `/api/organizations/{org_id}/archive` | 归档组织 |
| PATCH | `/api/organizations/{org_id}/restore` | 恢复组织 |
| GET | `/api/departments` | 查看部门列表 |
| POST | `/api/departments` | 创建部门 |
| PUT | `/api/departments/{department_id}` | 编辑部门 |
| PATCH | `/api/departments/{department_id}/archive` | 归档部门 |
| PATCH | `/api/departments/{department_id}/restore` | 恢复部门 |

### 知识库

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/kbs` | 按权限查看知识库 |
| POST | `/api/kbs` | 创建知识库 |
| PUT | `/api/kbs/{kb_id}` | 编辑知识库 |
| PATCH | `/api/kbs/{kb_id}/status` | 启用或禁用知识库 |
| GET | `/api/knowledge-bases` | `/api/kbs` 的兼容路径 |

### 文档与上传

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/upload/file` | 上传 Word、Excel、文本型 PDF |
| POST | `/api/upload/link` | 导入公开链接或飞书链接 |
| GET | `/api/documents` | 按知识库查看文档列表 |
| GET | `/api/documents/{document_id}` | 查看文档详情和 Chunk 预览 |
| POST | `/api/documents/{document_id}/parse` | 解析文档、分块、向量化并入库 |
| DELETE | `/api/documents/{document_id}` | 删除文档及其 Chunk |

### 问答与历史

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/chat/stream` | SSE 流式 RAG 问答 |
| GET | `/api/sessions` | 查看会话列表 |
| POST | `/api/sessions` | 创建空会话 |
| GET | `/api/sessions/{session_id}` | 查看会话详情 |
| DELETE | `/api/sessions/{session_id}` | 删除本人会话 |
| GET | `/api/qa-history` | 分页查看问答历史 |
| GET | `/api/qa-history/filter-options` | 获取历史筛选项 |

### 流程定义

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/processes` | 查看流程定义 |
| POST | `/api/processes` | 管理员创建流程定义 |

### SSE 事件说明

`POST /api/chat/stream` 返回 Server-Sent Events：

| 事件 | 说明 |
| --- | --- |
| `metadata` | 返回 `session_id`、引用来源、是否流程类问题等元信息 |
| `delta` | 返回模型增量文本 |
| `done` | 返回最终 `session_id` 和 citations |
| `error` | 返回错误信息 |

写操作通常需要携带 `X-CSRF-Token`。前端已通过 `apiClient` 自动处理 CSRF 获取、Cookie 携带和 401 跳转。

## 技术栈

### 前端

- TypeScript
- React
- Next.js
- Tailwind CSS
- lucide-react
- Server-Sent Events 前端流式解析

### 后端

- Python
- FastAPI
- SQLAlchemy
- Alembic
- Pydantic Settings
- Uvicorn
- Pytest

### 数据库与检索

- PostgreSQL 16
- pgvector
- Docker Compose
- `sentence-transformers/all-MiniLM-L6-v2`
- 384 维向量
- 本地 CPU Embedding
- 本地模型不可用时使用确定性 fallback，保证演示可运行

### 大模型与外部服务

- DeepSeek API
- OpenAI 兼容 Chat Completions 接口
- SSE 流式输出
- 飞书 OpenAPI 文档解析
- ngrok 内网穿透

### 存储与部署

- 本地文件系统存储上传文件
- Docker PostgreSQL 数据库
- 本地前后端开发启动
- 可选 Docker Compose 整体启动
