# 数据库与上传文件迁移 SOP

适用场景：Windows 本机 Docker PostgreSQL/pgvector 数据迁移到 Ubuntu 虚拟机 Docker PostgreSQL/pgvector。当前项目容器名示例为 `ekbrqao-postgres`，数据库名为 `rag_db`。执行前请按实际容器名、目录和 SSH 地址替换示例。

当前随项目提供的 `rag_db.sql` 文件属性、数据快照行数、校验哈希和版本兼容性见项目根目录 [`rag_db.backup-info.md`](../rag_db.backup-info.md)。每次新导出后以新文件头和校验结果为准。

## 迁移范围

一次完整的数据迁移包括：

1. PostgreSQL 数据库备份（schema、表数据、索引、约束、扩展及 `alembic_version`）。
2. 后端上传文件目录 `backend/uploads/`（数据库只保存文件路径，不包含原始文件本身）。
3. 已在虚拟机的项目代码与 `.env`。代码从 Git 获取；`.env` 单独安全转移，不提交 Git，也不要贴到聊天或公开位置。

不需要迁移 `.venv`、`node_modules`。迁移前后使用同一项目版本，并确保数据库使用 pgvector 镜像。

## 0. 确认本机应用连接的数据库

本机后端若在 Windows 主机直接运行，连接通常是 `localhost:5433/rag_db`；Docker 容器内的 PostgreSQL 端口是 `5432`。先确认正确容器和映射：

```powershell
docker ps
```

应看到类似 `0.0.0.0:5433->5432/tcp` 的映射。确认该容器确实是本机网站使用的数据库；不要仅凭 pgAdmin 中数据库同名就判断。

可在 pgAdmin Query Tool 中核对：

```sql
SELECT current_database(), current_user;
SELECT 'users' AS table_name, count(*) FROM public.users
UNION ALL SELECT 'knowledge_bases', count(*) FROM public.knowledge_bases
UNION ALL SELECT 'documents', count(*) FROM public.documents
UNION ALL SELECT 'document_chunks', count(*) FROM public.document_chunks;
```

记录结果作为迁移前基线。不要记录或分享密码、Token、API Key。

## 1. 在 Windows 本机导出数据库

优先用运行 PostgreSQL 16 的源容器内的 `pg_dump` 导出，避免用 pgAdmin 配置的 PostgreSQL 18 客户端生成面向 PostgreSQL 16 的转储文件。PostgreSQL 18 的纯文本转储可能包含 PostgreSQL 16 不支持的设置项或较新的 psql 元命令。

在 PowerShell 中进入项目根目录并确认当前目录：

```powershell
Set-Location 'F:\求职\产品\企业知识库 RAG 问答系统运营项目\Enterprise-Knowledge-Base-RAG-Q-A-Operations-Project'
Get-Location
docker ps
```

用 Windows `cmd` 完成标准输出重定向，避免旧版 Windows PowerShell 改写文本编码：

```powershell
cmd /c "docker exec ekbrqao-postgres pg_dump -U postgres -d rag_db --format=plain --encoding=UTF8 > rag_db_YYYYMMDD.sql"
```

把 `YYYYMMDD` 替换为当天日期。确认导出文件存在且大小合理：

```powershell
Get-Item .\rag_db_YYYYMMDD.sql | Select-Object Name, Length, LastWriteTime
Select-String -Path .\rag_db_YYYYMMDD.sql -Pattern '^CREATE TABLE public\.(documents|knowledge_bases)|^COPY public\.(users|knowledge_bases|documents|document_chunks) '
```

应能搜到表结构和数据段；仅有 PostgreSQL dump 头尾、没有 `CREATE TABLE`/`COPY` 的文件不是完整数据备份。对比基线记录中的关键表数量。

## 2. 备份并传输上传文件

如果 `backend/uploads/` 存在文件，将其与 SQL 放在同一迁移目录。不要改变目录内部结构；文档记录的 `file_path` 依赖这些文件路径。

```powershell
Test-Path .\backend\uploads
Get-ChildItem .\backend\uploads -Recurse -File | Measure-Object -Property Length -Sum
```

将 SQL 与 uploads 传至虚拟机项目目录（替换虚拟机地址和用户名）：

```powershell
scp .\rag_db_YYYYMMDD.sql smartli@<VM_IP>:/home/smartli/Enterprise-Knowledge-Base-RAG-Q-A-Operations-Project/
scp -r .\backend\uploads smartli@<VM_IP>:/home/smartli/Enterprise-Knowledge-Base-RAG-Q-A-Operations-Project/backend/
```

如果上传目录为空或不存在，第二条命令可以跳过。`.env` 不要放入 Git，也不要通过公开链接传输。

## 3. 虚拟机先备份现有数据库

在 Ubuntu 虚拟机执行。先确认容器和备份文件位置：

```bash
cd /home/smartli/Enterprise-Knowledge-Base-RAG-Q-A-Operations-Project
docker ps
ls -lh rag_db_YYYYMMDD.sql
```

在替换或恢复数据前，给虚拟机当前数据库再做一份 custom 格式备份：

```bash
docker exec ekbrqao-postgres pg_dump -U postgres -d rag_db -Fc -f /tmp/rag_db_before_migration.dump
docker cp ekbrqao-postgres:/tmp/rag_db_before_migration.dump ./rag_db_before_migration.dump
ls -lh ./rag_db_before_migration.dump
```

如果虚拟机已有上传文件，也先复制/归档 `backend/uploads/`。不要在没有确认备份文件存在且大小合理前删除或覆盖旧数据。

## 4. 将 SQL 恢复到目标数据库

建议先恢复到临时库并核验，避免直接覆盖正在使用的库。以下以 `rag_db_import` 为临时库：

```bash
docker exec -i ekbrqao-postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE rag_db_import;'
set -o pipefail
docker exec -i ekbrqao-postgres psql -U postgres -d rag_db_import -v ON_ERROR_STOP=1 --single-transaction < ./rag_db_YYYYMMDD.sql
```

**版本兼容提醒：** 上面的直接导入命令适用于按第 1 节用 PostgreSQL 16 `pg_dump` 新生成的文件。项目当前根目录的 `rag_db.sql` 是 `pg_dump 18.6` 生成、目标为 PostgreSQL 16 的旧快照，不要把它误认为与新文件版本相同。优先从本机源库用 PostgreSQL 16 客户端重新导出。如果无法访问源库，而必须恢复这份已确认来自本项目的可信文件，可在临时库中使用以下兼容命令。它会移除 PG16 不认识的新版 psql 限制标记和 PG17 才有的 `transaction_timeout` 设置；`\restrict` 是 psql 的安全标记，因此该兼容处理只适用于自己生成且来源可信的备份：

```bash
set -o pipefail
sed -E '/^\\(restrict|unrestrict)( |$)/d; /^SET transaction_timeout = 0;$/d' ./rag_db.sql \
  | docker exec -i ekbrqao-postgres psql -U postgres -d rag_db_import -v ON_ERROR_STOP=1 --single-transaction
```

若数据库已存在，不要重复创建；先确认它是本次临时库，并按组织的数据保留要求处理。导入期间出现任何 `ERROR` 都视为失败，不要继续切换应用连接。

## 5. 核对数据与 schema

在临时库检查关键行数：

```bash
docker exec -i ekbrqao-postgres psql -U postgres -d rag_db_import -c "SELECT 'users' AS table_name, count(*) FROM public.users UNION ALL SELECT 'knowledge_bases', count(*) FROM public.knowledge_bases UNION ALL SELECT 'documents', count(*) FROM public.documents UNION ALL SELECT 'document_chunks', count(*) FROM public.document_chunks;"
```

与源库基线比较。对于本文档对应的示例备份，曾检查到 8 个知识库、11 条文档记录、41 条 chunk；不同时间重新导出的备份数量可以变化，应以此次源库查询结果为准。

核对 `documents.chunk_count` 与 chunk 实际记录数：

```bash
docker exec -i ekbrqao-postgres psql -U postgres -d rag_db_import -c "SELECT d.id, d.file_name, d.chunk_count, count(c.id) AS actual_chunk_count FROM public.documents d LEFT JOIN public.document_chunks c ON c.document_id = d.id GROUP BY d.id, d.file_name, d.chunk_count HAVING d.chunk_count <> count(c.id);"
```

若查询返回行，先调查差异，不要忽略或直接改计数。

确认迁移版本及字段：

```bash
docker exec -i ekbrqao-postgres psql -U postgres -d rag_db_import -c 'SELECT version_num FROM public.alembic_version;'
docker exec -i ekbrqao-postgres psql -U postgres -d rag_db_import -c "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='source_markdown';"
```

项目部署后端在虚拟机上的 `.venv` 时，在后端目录检查代码的迁移 head：

```bash
cd /home/smartli/Enterprise-Knowledge-Base-RAG-Q-A-Operations-Project/backend
.venv/bin/python -m alembic heads
```

数据库版本与 `heads` 相同则 schema 已最新。若数据库版本低于代码 head，先确认后端 `.env` 指向刚核验的目标库，再执行：

```bash
.venv/bin/python -m alembic current
.venv/bin/python -m alembic upgrade head
.venv/bin/python -m alembic current
```

不要用 `alembic stamp` 代替迁移。`upgrade head` 只对当前连接的数据库执行迁移；务必确认目标地址和数据库名正确。

## 6. 恢复 uploads 并切换应用

将上传目录放到虚拟机项目的 `backend/uploads/`，并检查文件数量和总大小。项目采用 Docker Compose 时，Compose 将宿主机 `./backend/uploads` 挂载到后端容器 `/app/uploads`；因此相对目录结构必须保留。

确认 `.env`/运行环境中的数据库连接指向临时库后，重启后端并做业务验收。Docker 网络内后端连接 PostgreSQL 一般使用服务名和容器端口（例如 `postgres:5432`）；在虚拟机宿主机直接运行 `.venv` 后端才使用宿主机映射端口（例如 `localhost:5433`）。以实际启动方式为准，不能把两种地址混用。

至少验收：

1. `/api/health` 可用。
2. 登录接口和 `/api/kbs` 返回成功。
3. `/api/documents?knowledge_base_id=<有效知识库ID>` 返回 200。
4. 文档列表、文档详情和原始上传文件可访问。
5. 抽查问答引用和历史会话。

确认临时库和文件均正确后，再按维护窗口将应用连接切换到新库，或按计划替换正式库。切换后再次核验，并保留旧数据库备份一段确认期；确认业务正常前不要删除旧备份。

## 故障处理原则

- 导入报告 `ERROR`：由于使用了 `ON_ERROR_STOP` 与 `--single-transaction`，该次导入应回滚；查看首个错误原因，修复后在空的临时库重试。
- `alembic current` 与 `heads` 不一致：确认 `.env` 实际目标库，再执行 `alembic upgrade head`。
- 文档记录存在但文件打不开：核对 `backend/uploads/` 是否迁移完整，以及后端实际 `UPLOAD_DIR` 和 Compose 挂载路径。
- 数据行数不一致：先确认源/目标是否同一数据库及快照时间，再检查备份文件内容；不要通过手工补数掩盖问题。
- 迁移中不要公开 `.env`、数据库密码、API Key、用户哈希或完整的敏感审计数据。
