# Stage 7 全量回归清单

环境：起后端 + 前端，DevTools 勾 "Preserve log"

## A 组：认证与路由守卫

- [ ] A1. 未登录访问 / -> 跳 /login
- [ ] A2. 未登录访问 /chat -> middleware 拦 -> /login?redirect=%2Fchat
- [ ] A3. 未登录访问 /knowledge -> 拦 -> /login?redirect=%2Fknowledge
- [ ] A4. 登录后访问 / -> 跳 /chat
- [ ] A5. 登录后访问 /login -> 无闪烁，直接跳 /chat
- [ ] A6. 登录后访问 /register -> 无闪烁，直接跳 /chat
- [ ] A7. must_change_password=true 用户登录 -> 跳 /change-password
- [ ] A8. 登出 -> 跳 /login

## B 组：8 个独立路由渲染

- [ ] B1. /chat -> 对话窗口 + 引用面板
- [ ] B2. /dashboard -> 4 个统计卡片 + 快速入口
- [ ] B3. /knowledge -> 知识库列表
- [ ] B4. /ingestion -> 文档入库页
- [ ] B5. /workflow -> 流程图
- [ ] B6. /history -> 问答历史
- [ ] B7. /admin -> 5 个 tab / panel
- [ ] B8. /account -> 会话列表
- [ ] B9. 每个页面 Topbar 显示"超级管理员"

## C 组：?view= 兼容

- [ ] C1. /?view=chat -> /chat
- [ ] C2. /?view=dashboard -> /dashboard
- [ ] C3. /?view=knowledge -> /knowledge
- [ ] C4. /?view=ingestion -> /ingestion
- [ ] C5. /?view=workflow -> /workflow
- [ ] C6. /?view=history -> /history
- [ ] C7. /?view=admin -> /admin
- [ ] C8. /?view=account -> /account
- [ ] C9. /?view=invalid -> /chat

## D 组：Sidebar 导航

- [ ] D1. 8 个菜单项全部渲染为 `<Link>`（不是 button）
- [ ] D2. 从 /chat 点 dashboard -> URL 变 /dashboard
- [ ] D3. 从 /dashboard 点 knowledge -> URL 变 /knowledge
- [ ] D4. 从 /knowledge 点 chat -> URL 变 /chat
- [ ] D5. 所有 8 个跳转都实际改变 URL

## E 组：核心业务

- [ ] E1. /chat 提问 -> SSE 流式回答
- [ ] E2. /chat 连续问两题 -> 引用不串场
- [ ] E3. /chat 切知识库 -> 旧 SSE abort（Network canceled）
- [ ] E4. /chat 点击引用 -> 文档详情弹窗
- [ ] E5. /knowledge?kb=<id> -> 自动展开文档列表
- [ ] E6. /knowledge 点"进入问答" -> /chat?kb=<id>
- [ ] E7. /knowledge 点"入库文档" -> /ingestion?kb=<id>
- [ ] E8. /knowledge 点"查看入库文件" -> 展开 + 滚动
- [ ] E9. /ingestion 上传文档 -> 成功
- [ ] E10. /ingestion 解析文档 -> chunk 回写
- [ ] E11. /dashboard 4 个快速入口全部正确
- [ ] E12. /admin 5 个 tab / panel 正常
- [ ] E13. /admin 创建知识库 -> notice 显示
- [ ] E14. /account 撤销 session
- [ ] E15. /history 列表正常
- [ ] E16. /workflow 流程图渲染

## F 组：跨页面状态传递

- [ ] F1. /chat?kb=<id> -> selectedKb 正确
- [ ] F2. /ingestion?kb=<id> -> selectedKb 正确
- [ ] F3. /knowledge?kb=<id> -> focusKbId 正确
- [ ] F4. 尖括号参数也正确（/<route>?kb=<id>）

## G 组：Console 检查

- [ ] G1. 无红色 error
- [ ] G2. 无 "Cannot update a component while rendering" 警告
- [ ] G3. 无 "multiple router.replace" 警告
- [ ] G4. 无其他 warning

## H 组：Network 检查

- [ ] H1. 所有请求带 Cookie
- [ ] H2. 写操作带 X-CSRF-Token
- [ ] H3. 无 401（除登出后）
- [ ] H4. 无 500

## I 组：认证安全回归

- [ ] I1. 删 Cookie 后点击操作 -> 跳 /login
- [ ] I2. 断网提问 -> 提示网络异常，不登出
- [ ] I3. 登出后刷新 -> 保持未登录
- [ ] I4. 多标签页登出同步（如果做了）

## 汇总模板

如果某项失败，请记录：

- 清单编号（如 E3）
- 操作步骤
- 预期行为
- 实际行为
- 截图（可选）
- Console 报错（如有）
