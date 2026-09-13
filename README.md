# 企业知识库 RAG 问答系统

本项目是企业知识库 RAG 问答系统，用于作品集展示和内部小范围试用，支持多角色、部门强隔离、文档入库、向量检索、DeepSeek 流式问答、引用溯源和流程图可视化。

## 当前进度

- 已完成前端工程：`frontend/`
- 已完成业务页面：登录、运营总览、知识库管理、文档入库、知识库问答、流程图、问答历史、系统管理
- 已搭建后端工程：`backend/`
- 已完成后端基础模块：登录鉴权、知识库、文档上传、文本型 PDF/Word/Excel 解析、RAG 分块、本地 Embedding 封装、向量检索、DeepSeek SSE 问答、流程定义、审计数据模型
- 已提供 Alembic 初始迁移、API 文档和 RAG 最小测试样例

## 前端启动

```powershell
cd frontend
npm install
npm run dev -- --port 3000
```

访问：

```text
http://127.0.0.1:3000/
```

## 后端启动

```powershell
cd backend
python -m venv --prompt=EKBRQAO .venv
.venv\Scripts\python.exe -m pip install --cache-dir F:\1111111softsmome\pip-cache -r requirements.txt
Copy-Item .env.example .env
```

编辑 `backend/.env`，填入本地数据库、JWT Secret 和 DeepSeek API Key。真实密钥只允许写入本地 `.env` 或系统环境变量，不写入仓库文件。

```powershell
.venv\Scripts\alembic.exe upgrade head
.venv\Scripts\python.exe scripts_init_admin.py
.venv\Scripts\uvicorn.exe app.main:app --reload --host 127.0.0.1 --port 8000
```

后端 API 地址：

```text
http://127.0.0.1:8000/api/health
http://127.0.0.1:8000/docs
```

## Docker Compose

项目已提供 `docker-compose.yml`，包含 PostgreSQL + pgvector、FastAPI 后端和 Next.js 前端。首次启动前仍需创建 `backend/.env` 并填入本地真实配置。

```powershell
docker compose up --build
```

## 环境变量

Windows 手动配置入口：

```text
Win + R -> 输入 sysdm.cpl -> 高级 -> 环境变量
```

用户变量可按需添加：

```text
DEEPSEEK_API_KEY=你的 DeepSeek Key
DATABASE_URL=postgresql+psycopg://postgres:你的数据库密码@localhost:5433/rag_db
SECRET_KEY=生产环境随机长字符串
```

## 安全约束

真实 API Key、App Secret、JWT Secret 等敏感信息不得写入仓库，统一通过本地 `.env` 或系统环境变量配置。
