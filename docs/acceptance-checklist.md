# 项目验收清单

## 路由与页面

- [ ] 8 个独立路由可访问：/chat /dashboard /knowledge /ingestion /workflow /history /admin /account
- [ ] 根路径 / 已登录跳 /chat，未登录跳 /login
- [ ] /?view=xxx 兼容跳转
- [ ] Sidebar 8 个菜单项全部 <Link>

## 认证与安全

- [ ] 注册 / 登录 / 登出 / 改密闭环
- [ ] must_change_password 强制改密
- [ ] 邀请码注册闭环
- [ ] Session 管理（列表 / 撤销）
- [ ] httpOnly cookie
- [ ] CSRF token 校验
- [ ] 401 立即跳登录
- [ ] 网络错误不误登出

## 数据隔离

- [ ] A 组织看不到 B 组织文档
- [ ] A 组织 RAG 检索不召回 B 组织文档
- [ ] 同组织跨部门隔离
- [ ] super_admin 可看本组织全部

## 核心业务

- [ ] 文档上传 / 解析 / chunk 回写
- [ ] RAG 问答 SSE 流式
- [ ] 引用来源展示 / 点击详情
- [ ] 会话历史
- [ ] 知识库管理
- [ ] 系统管理 5 个 tab
- [ ] 流程图
- [ ] 账号会话管理

## 工程质量

- [ ] npx tsc --noEmit 通过
- [ ] npm run build 通过
- [ ] 无 Next.js deprecated 警告
- [ ] Console 无 error / warning
- [ ] 无 P0 / P1 bug

## 文档

- [ ] docs/auth-org-migration-design.md
- [ ] docs/frontend-structure-migration.md
- [ ] docs/stage-7-regression-checklist.md
- [ ] docs/migration-completion-report.md
- [ ] docs/acceptance-checklist.md
- [ ] docs/api_reference.md（如更新）

## 验收结论

- 通过 / 有条件通过 / 不通过
- 验收人 / 日期
