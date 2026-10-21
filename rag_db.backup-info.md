# `rag_db.sql` 数据库迁移文件属性说明

本说明与项目根目录的 `rag_db.sql` 配套。每次重新生成 SQL 文件后，都应重新核对本说明中的动态属性，避免把旧的备份时间、版本或数据量误当成新文件信息。

## 文件属性

| 属性 | 当前文件信息 |
| --- | --- |
| 文件名 | `rag_db.sql` |
| 格式 | PostgreSQL 纯文本 SQL dump（不是 CSV，也不是 pgAdmin 的 Custom 二进制归档） |
| 字符编码 | UTF-8；dump 中设置 `client_encoding = 'UTF8'` |
| 源数据库 | PostgreSQL `16.15`（Debian 构建） |
| 导出工具 | `pg_dump 18.6` |
| dump 时间 | `2026-10-16 11:29:53`（文件头记录的时间） |
| Alembic schema 版本 | `20260930_0501` |
| 当前文件大小 | 仓库工作区检查值约 `589 KB`；换行符或重新导出会改变文件大小 |
| 当前 SHA-256 | `943F2BC386D8F57B3BDB97EA2B076BF36F8C7A93D4E64F78C035D21DF9337A72` |

SHA-256 是当前仓库文件的校验值。文件重新生成、Git 行尾转换或被修改后，该值会变化；分发前应在实际文件上重新计算，并将新值告知接收方。

## 数据范围

当前文件包含数据库 schema 和表数据，包括扩展声明、枚举、表、索引、约束、`alembic_version` 及数据记录。检查到 18 张表：

| 数据表 | 行数 |
| --- | ---: |
| `users` | 8 |
| `organizations` | 5 |
| `departments` | 7 |
| `knowledge_bases` | 8 |
| `documents` | 11 |
| `document_chunks` | 41 |
| `chat_sessions` | 15 |
| `chat_messages` | 66 |
| `auth_sessions` | 118 |
| `audit_logs` | 227 |
| `org_invites` | 9 |
| `api_usage_logs` | 0 |
| `processes` | 0 |
| `process_nodes` | 0 |
| `process_edges` | 0 |
| `process_documents` | 0 |
| `process_node_chunks` | 0 |
| `alembic_version` | 1 |

这些数量是此快照的检查值，不代表后续重新导出的文件仍有相同数量。恢复后应以迁移当次的源库基线为准。

## 不包含的内容

- `backend/uploads/` 下的原始上传文件。数据库中的 `documents.file_path` 只是路径记录；需要单独备份和传输该目录，并保留目录结构。
- 项目代码、`.env`、API Key、数据库角色密码、其他数据库或整个 PostgreSQL 集群的全局对象。
- PostgreSQL 数据目录的物理备份。

本文件包含用户、密码哈希、认证会话哈希、邀请和审计记录等敏感业务数据。应作为私有备份传输和保存；不要提交到公开 Git 仓库或公开网盘。`.env` 不应放入本文件或公开仓库。

## PostgreSQL 版本兼容性

虽然源服务器是 PostgreSQL 16.15，这份脚本由 PostgreSQL 18.6 的 `pg_dump` 客户端生成，客户端主版本高于服务器/虚拟机目标版本 PostgreSQL 16。当前 dump 包含 `\restrict` / `\unrestrict` psql 元命令，以及 `transaction_timeout` 设置；后者是 PostgreSQL 17 加入的参数。因此它**不是推荐直接交给 PostgreSQL 16 的 psql 原样恢复的文件**，可能出现版本不识别错误。

推荐以后重新导出时，使用 PostgreSQL 16 的 `pg_dump` 客户端连接源库并生成纯文本 dump；本机源库容器是 PostgreSQL 16 时，可直接使用容器中的客户端。导出后重新检查头部的 `Dumped by pg_dump version`，并在隔离的临时库先完成一次恢复验证。具体命令见 [数据库与上传文件迁移 SOP](docs/database-migration-sop.md)。

如果必须使用当前这份文件恢复到 PostgreSQL 16，应只对可信的自有备份按 SOP 中针对版本差异的兼容步骤操作，并通过 `ON_ERROR_STOP` 和单事务控制导入；不要忽略导入错误，也不要把未验证的 SQL dump 直接送入生产数据库。

## 接收方校验

传输前后分别计算 SHA-256，确认文件没有损坏：

Windows PowerShell：

```powershell
Get-FileHash .\rag_db.sql -Algorithm SHA256
```

Ubuntu：

```bash
sha256sum rag_db.sql
```

两端哈希必须一致。若不一致，重新传输，不要继续导入。恢复后再核对 `alembic_version`、关键表行数、文档与 chunk 计数、`documents.source_markdown` 字段，并确认上传目录已单独恢复。
