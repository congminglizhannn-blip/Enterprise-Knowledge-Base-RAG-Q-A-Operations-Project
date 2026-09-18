# 前端结构迁移设计

## 1. 背景

当前前端主要集中在：

```text
frontend/app/globals.css
frontend/app/layout.tsx
frontend/app/page.tsx
```

这是 Next.js App Router 的基础约定，但不是适合长期维护的业务结构。当前 `page.tsx` 同时包含类型定义、登录态、接口请求、布局组件、知识库页面、文档入库页面、问答页面、流程图、历史记录和系统管理等逻辑。随着认证 cookie 化、注册、邀请、组织权限、RAG 引用、文档管理继续增加，单文件会变得难以定位问题，也难以小步验证。

本迁移只调整前端代码组织，不改变现有业务行为。每一步迁移后必须保证 `npm run build` 通过，并人工验证页面行为不变。

版本假设：

- 当前项目 `frontend/package.json` 使用 Next.js `^16.3.4`、React `^19.1.1`。
- 文档中的 App Router、Server Component、`cookies()` 示例按 Next.js 16 口径编写。
- `cookies()` 视为异步 API 使用，即 `const cookieStore = await cookies()`。

## 2. 现状盘点

当前 `frontend/app/page.tsx` 中包含：

| 内容 | 当前位置 | 迁移目标 |
|---|---|---|
| `View`、`Role`、`KnowledgeBase`、`UploadRow` 等类型 | `app/page.tsx` | `types/` 或对应 `features/*/types.ts` |
| `API_BASE`、`AuthenticatedFetch`、token 刷新逻辑 | `app/page.tsx` | `lib/apiClient.ts`、`features/auth/api.ts` |
| `LoginPage` | `app/page.tsx` | `features/auth/LoginPage.tsx` |
| `Sidebar`、`Topbar` | `app/page.tsx` | `components/layout/` |
| `Card`、`DataTable` | `app/page.tsx` | `components/ui/` |
| `KnowledgePage` | `app/page.tsx` | `features/documents/KnowledgePage.tsx` 或 `features/knowledge/` |
| `IngestionPage` | `app/page.tsx` | `features/documents/IngestionPage.tsx` |
| `ChatPage` | `app/page.tsx` | `features/chat/ChatPage.tsx` |
| `HistoryPage` | `app/page.tsx` | `features/chat/HistoryPage.tsx` |
| `WorkflowPage` | `app/page.tsx` | `features/rag/WorkflowPage.tsx` |
| `AdminPage` | `app/page.tsx` | `features/admin/AdminPage.tsx` |

## 3. 目标目录结构

建议目标结构：

```text
frontend/
  middleware.ts
  app/
    layout.tsx
    globals.css
    page.tsx
    loading.tsx
    error.tsx
    not-found.tsx
    login/
      page.tsx
    register/
      page.tsx
    change-password/
      page.tsx
    chat/
      page.tsx
    documents/
      page.tsx
    knowledge/
      page.tsx
    admin/
      page.tsx
    account/
      page.tsx
  components/
    layout/
      AppShell.tsx
      Sidebar.tsx
      Topbar.tsx
    ui/
      Card.tsx
      DataTable.tsx
      EmptyState.tsx
      Modal.tsx
      Skeleton.tsx
      Spinner.tsx
  features/
    auth/
      api.ts
      AuthContext.tsx
      AuthGate.tsx
      hooks.ts
      types.ts
      LoginPage.tsx
      RegisterPage.tsx
      ChangePasswordPage.tsx
      SessionsPanel.tsx
    documents/
      api.ts
      types.ts
      IngestionPage.tsx
      KnowledgePage.tsx
      DocumentTable.tsx
      DocumentDetailModal.tsx
    chat/
      api.ts
      types.ts
      ChatPage.tsx
      MessageList.tsx
      CitationPanel.tsx
      Composer.tsx
      HistoryPage.tsx
    rag/
      types.ts
      WorkflowPage.tsx
      citation.ts
    admin/
      api.ts
      types.ts
      AdminPage.tsx
      InvitePage.tsx
  hooks/
    useLocalStorage.ts
  lib/
    apiClient.ts
    routing.ts
    userPreferences.ts
    format.ts
  types/
    common.ts
```

## 4. 职责边界

### 4.1 app/

`app/` 只放 Next.js 路由、页面入口、layout 和必要 route handlers。

原则：

- `app/page.tsx` 只做页面装配，不写大段业务逻辑。
- 未来 `/login`、`/register`、`/change-password`、`/chat`、`/documents`、`/knowledge`、`/admin`、`/account` 等页面由 `app/*/page.tsx` 承接路由。
- 从阶段 3a 引入 AuthContext 起，到阶段 7e 结束前，`app/page.tsx` 必须是 Client Component，用于承载单页壳、`useState` 当前 view、AuthContext 和 AuthGate。
- 阶段 3a-7e 期间，`app/page.tsx` 不能直接用 `cookies()` 读取认证状态，认证状态一律由 AuthContext 提供。
- 阶段 7f 后，`app/page.tsx` 才改为 Server Component 根路径重定向页：未登录跳 `/login`，已登录跳 `/chat`，不再保留单独 Dashboard。
- `app/loading.tsx` 提供全局加载态，`app/error.tsx` 提供全局错误边界，`app/not-found.tsx` 提供 404 页面。
- 路由层只负责组合 feature 组件、处理页面级 redirect 和布局。
- `frontend/middleware.ts` 负责请求进入页面前的粗粒度跳转：未携带认证 cookie 时访问受保护页面，直接跳 `/login?redirect=<原路径>`。
- `middleware.ts` 只能检查 cookie 是否存在，不能代替后端权限校验，也不能证明 session 有效。
- `middleware.ts` 运行在 Next.js Edge Runtime 中，不能查数据库，不能 import `apiClient`，也不能在里面调用 `/api/auth/me`。
- `middleware.ts` 读取 cookie 应使用 `request.cookies.get("session_token")?.value`，不能使用 `document.cookie`。
- cookie 存在但 session 被撤销、过期或用户必须改密时，由 `AuthContext` 调用 `/api/auth/me` 后处理。
- 不再保留 `features/auth/routeGuard.ts`。认证拦截只分三层：`middleware.ts` 做 cookie 存在性检查，`AuthGate` 做客户端登录态和强制改密判断，后端接口做真正安全校验。
- `app/page.tsx` 只有阶段 7f 后才使用 Server Component 读取 cookie 并重定向，避免根路径闪烁。

### 4.2 components/

`components/` 放跨业务复用的 UI 和布局组件。

包括：

- `Sidebar`
- `Topbar`
- `AppShell`
- `Card`
- `DataTable`
- `EmptyState`
- `Modal`

这里不能放具体业务请求逻辑，例如“上传文档”“RAG 问答”。

`AppShell` 只负责布局，不读取 AuthContext，也不承担 AuthGate 职责。认证门禁由 `features/auth/AuthGate.tsx` 在路由或页面壳层包裹业务页面，避免 `components/layout` 反向依赖 `features/auth`。

登出入口由宿主层负责串联：

- `Topbar` 接受 `onLogout?: () => void`，只在用户点击登出时调用该回调。
- `Topbar` 仅在 `onLogout` 存在时渲染登出按钮；未登录或无需登出时，宿主层不传 `onLogout`。
- 阶段 3a-6a 期间，`Topbar` 和 `AppShell` 仍在 `app/page.tsx` 内联，不引入独立文件；内联 `Topbar` 由内联 `AppShell` 内部渲染。
- 阶段 3a 起，内联 `AppShell` 就接受 `onLogout?: () => void`，并透传给内部 `Topbar`。
- 阶段 6a 迁移 `Topbar`、`AppShell` 到 `components/layout/` 时，`Topbar`、`AppShell` 保留既有 `onLogout` prop 签名不变，不重新设计登出链路。
- `Topbar`、`AppShell` 都不读取 AuthContext，也不直接调用 auth API。
- 单页壳或独立路由页作为宿主组件，负责实现 `onLogout`：先调用 `features/auth/api.ts` 的 `logout()` 或 AuthContext 暴露的登出动作，再根据当前阶段切换 `setView("login")` 或 `router.replace("/login")`。
- 宿主层实现 `onLogout` 时必须保证无论 `logout()` 是否抛异常，都要执行 UI 切换，推荐使用 `try/finally` 或 `await logout().catch(() => {})`。
- 3a-7e 期间，因为 `AuthGate` 已拦截未登录用户，业务壳内的宿主层可以无条件传 `onLogout`，`Topbar` 会显示登出按钮。若未来放宽 AuthGate 包裹范围，再由宿主层按 `status === "authenticated"` 决定是否传 `onLogout`。
- `Topbar` 点击登出后应临时禁用登出按钮，等待 `onLogout()` 返回或页面跳转，避免用户双击触发重复 logout；`onLogout` 内部也应保持幂等。

认证页面布局规则：

- `app/login/page.tsx`、`app/register/page.tsx`、`app/change-password/page.tsx` 使用独立 auth 布局，不包含 Sidebar、Topbar、AppShell。
- 本期如果暂不引入 `(auth)` 路由组，可以在页面内用简单容器承载表单；后续再抽 `app/(auth)/layout.tsx`。
- 只有 `/chat`、`/documents`、`/knowledge`、`/admin`、`/account` 等业务路由使用 AppShell。

### 4.3 features/

`features/` 按业务能力组织。

- `features/auth`：登录、注册、登出、认证状态、认证门禁、认证 API。
- `features/documents`：知识库文件列表、文档入库、解析、文件详情。
- `features/chat`：问答窗口、SSE 消费、引用来源、历史会话。
- `features/rag`：流程图、引用结构、RAG 展示辅助。
- `features/admin`：用户、部门、后续邀请码和 session 管理入口。

每个 feature 可以有自己的 `api.ts`、`types.ts`、组件和 hooks。

认证相关页面归属：

| 功能 | 路由入口 | Feature 组件 |
|---|---|---|
| 登录 | `app/login/page.tsx` | `features/auth/LoginPage.tsx` |
| 注册 | `app/register/page.tsx` | `features/auth/RegisterPage.tsx` |
| 强制改密 | `app/change-password/page.tsx` | `features/auth/ChangePasswordPage.tsx` |
| 个人认证会话管理 | `app/account/page.tsx` 内账号设置区域 | `features/auth/SessionsPanel.tsx` |
| 邀请码管理 | 系统管理页内 tab，后续可独立路由 | `features/admin/InvitePage.tsx` |

命名约定：只有 `app/*/page.tsx` 是真正页面。feature 内部尽量使用 `Panel`、`List`、`Modal`、`Form` 等名称，避免 `SessionsPage.tsx` 这类组件名和路由页面混淆。

### 4.4 lib/

`lib/` 放前端通用基础设施。

适合放：

- `apiClient.ts`
- `routing.ts`，维护迁移期路由状态、已拆 view 清单和 redirect 校验
- `userPreferences.ts`，仅存非敏感 UI 偏好，不存 token、不存历史提问、不存对话内容
- `format.ts`
- 浏览器环境工具函数

不建议在前端 `lib/` 放真正的 `db`、`ai`、`vector` 逻辑。当前项目是前后端分离架构，这些能力属于后端 `backend/app/core` 或 `backend/app/services`。

`lib/routing.ts` 是迁移期唯一的路由状态来源，至少导出：

```ts
export type AuthView = "login" | "register" | "change-password";
export type BusinessView = "chat" | "documents" | "knowledge" | "admin" | "account";
export type View = AuthView | BusinessView;

export const BUSINESS_VIEWS: readonly BusinessView[] = [
  "chat",
  "documents",
  "knowledge",
  "admin",
  "account",
];

export const ROUTED_VIEWS: ReadonlySet<BusinessView> = new Set();
export const STATIC_KNOWN_ROUTES: readonly string[] = ["/"];

export const KNOWN_ROUTES: readonly string[] = [
  ...STATIC_KNOWN_ROUTES,
  ...Array.from(ROUTED_VIEWS).map((view) => `/${view}`),
];

export function normalizeActiveView(active: string | undefined): BusinessView | null {
  if (!active) return null;
  const normalized = active.replace(/^\//, "").split("/")[0];
  return BUSINESS_VIEWS.includes(normalized as BusinessView)
    ? (normalized as BusinessView)
    : null;
}

export function validateRedirectUrl(
  rawRedirect: string | null | undefined,
  origin: string,
): string | null {
  if (!rawRedirect) return null;

  let url: URL;
  try {
    url = new URL(rawRedirect, origin);
  } catch {
    return null;
  }

  if (url.origin !== origin) return null;

  if (KNOWN_ROUTES.includes(url.pathname)) {
    return `${url.pathname}${url.search}${url.hash}`;
  }

  if (url.pathname === "/" && url.searchParams.has("view")) {
    const view = url.searchParams.get("view");
    if (
      view &&
      BUSINESS_VIEWS.includes(view as BusinessView) &&
      !ROUTED_VIEWS.has(view as BusinessView)
    ) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  }

  return null;
}
```

`View` 在阶段 1-7f 期间定义在 `lib/routing.ts` 内，作为迁移期临时类型。`lib/routing.ts` 不从 `app/page.tsx` 或任何 `features/*/types.ts` 导入 `View`，避免 lib 反向依赖 app 或 feature。阶段 7f 单页壳消失后，删除 `View`、`ROUTED_VIEWS` 和相关兼容逻辑。

`login`、`register`、`change-password` 在阶段 3a-7b-1 期间作为单页壳 auth view 值存在；阶段 7b-2 拆出独立 auth 路由后，从单页壳 `View` 使用点中删除。`ROUTED_VIEWS` 只记录已经拆出的业务 view，类型必须是 `ReadonlySet<BusinessView>`，从不包含 `login`、`register`、`change-password`。

阶段 7b-2 拆出独立 auth 路由后，`AuthView` 可从 `View` 联合中移除，`View` 缩窄为 `BusinessView`。Sidebar 的 `active` 也随之缩窄为 `BusinessView` 或 `/${BusinessView}`，不再接受 auth view 值。

`KNOWN_ROUTES` 不能作为独立手工维护清单。迁移期只允许维护两个源头：`STATIC_KNOWN_ROUTES` 记录已经真实存在的非业务 view 路由，`ROUTED_VIEWS` 记录已经拆出的业务 view；`KNOWN_ROUTES` 必须由二者派生，供登录 redirect 校验使用，避免 `/chat`、`/documents` 等路由拆分后漏同步。

`normalizeActiveView()` 是 Sidebar 高亮的唯一归一化入口。Sidebar 不允许自行用 `replace("/", "")` 等方式处理 `active`，避免 `/admin/users` 这类嵌套路由高亮失败。

`validateRedirectUrl()` 是登录 redirect 的唯一安全校验入口。它必须先把 redirect 解析为同源 URL，再只用 `pathname` 对 `KNOWN_ROUTES` 做精确匹配；校验通过后返回包含 query 和 hash 的相对 URL，例如 `/chat?sessionId=123`。不能用 `startsWith("/chat")` 这类宽松判断，否则会引入开放重定向或路径伪装风险。函数接受显式 `origin` 参数，客户端调用时传 `window.location.origin`，服务端或中间件调用时传请求 origin，避免 `lib/routing.ts` 因直接访问 `window` 变成客户端专属模块。

阶段更新规则：

- 阶段 1-7b-1：`STATIC_KNOWN_ROUTES = ["/"]`，`ROUTED_VIEWS = new Set()`。
- 阶段 7b-2：`STATIC_KNOWN_ROUTES` 增加 `/login`、`/register`、`/change-password`，`ROUTED_VIEWS` 不变。
- 阶段 7c：`ROUTED_VIEWS` 增加 `chat`、`documents`。
- 阶段 7d：`ROUTED_VIEWS` 增加 `knowledge`、`admin`。
- 阶段 7e：`ROUTED_VIEWS` 增加 `account`。
- 阶段 7f：`ROUTED_VIEWS` 应包含全部业务 view，`KNOWN_ROUTES` 由派生结果覆盖全部已存在路径。

每个阶段必须在同一次改动中更新 `STATIC_KNOWN_ROUTES` 或 `ROUTED_VIEWS`。Sidebar、`/?view=` 处理和登录 redirect 校验都读取 `lib/routing.ts`，不能在组件内重复硬编码阶段状态。

### 4.5 hooks/

`hooks/` 放跨 feature 复用的 React hooks。

例如：

- `useLocalStorage`，仅用于 UI 偏好、侧边栏状态、上次选择的知识库等非敏感数据
- `useDebouncedValue`

只被某个 feature 使用的 hook 应放在该 feature 内。

不新增 `useAuthenticatedFetch`。认证请求统一走 `lib/apiClient.ts`，避免 hook、apiClient 和 AuthContext 三处同时处理 401，造成跳转循环和状态不一致。

### 4.6 types/

`types/` 放跨多个 feature 共享的类型。

仅某个业务域使用的类型放在对应 `features/*/types.ts`。

建议边界：

- `types/common.ts`：只放 `ApiError`、分页、排序、通用 ID 等跨域类型。
- `features/auth/types.ts`：放 `Role`、`UserInfo`、`OrganizationInfo`、`DepartmentInfo`。
- `features/documents/types.ts`：放 `KnowledgeBase`、`DocumentRow`、`UploadRow`。
- `features/chat/types.ts`：放 `ChatSession`、`ChatMessage`、`Citation`。
- 当前单页状态里的 `View` 应随着 App Router 路由拆分逐步消失，不长期沉淀为共享类型。

## 4.7 认证状态存储

最小方案采用 `features/auth/AuthContext.tsx`：

- 应用启动时调用 `/api/auth/me`。
- 成功后把 `user`、`org`、`department` 放入 React Context。
- 登录、注册、改密、登出后由 AuthContext 统一更新状态。
- AuthContext 暴露 `status: "loading" | "authenticated" | "unauthenticated" | "error"`，避免页面在 `/api/auth/me` 完成前误渲染受保护内容。
- AuthContext 暴露 `initializing`，只用于标识首次 `/api/auth/me` 校验过程。
- AuthContext 暴露 `mustChangePassword`，供 AuthGate 强制跳转 `/change-password`。
- AuthContext 暴露 `csrfReady`，表示登录后 CSRF token 已预取到内存；登录/注册成功后的页面跳转可等待该状态或超时。
- AuthContext 暴露 `error`，承载 `/api/auth/me` 网络错误、服务不可用等非 401 认证初始化失败。
- 不引入 Redux/Zustand，除非后续跨页面状态明显复杂化。
- 新版 cookie session 模式下，不再把 access token 或 refresh token 写入 `localStorage`。

新增 `features/auth/AuthGate.tsx` 承担认证门禁：

- `status === "loading"` 时显示全局 loading 或骨架屏，不渲染受保护页面。
- 未登录访问受保护页面时跳 `/login?redirect=<当前路径>`。
- AuthGate 只包受保护业务视图，不包 `LoginPage`、`RegisterPage`、`ChangePasswordPage`。
- AuthGate 永久保留 `onUnauthenticated` 和 `onMustChangePassword` 两个可选回调。3a-7b-1 期间单页壳传 `setView` 回调；7b-2 到 7c 期间单页壳仍存在但 auth 路由已拆出，宿主必须传带 `redirect=/?view=<当前view>` 的 `router.replace` 回调；7c 起独立业务路由页不传回调，由 AuthGate 内部 fallback 到 `router.replace()`。
- AuthGate 不在 render 过程中同步调用回调。AuthGate 内部必须用 `useRef` 保存最新的 `onUnauthenticated`、`onMustChangePassword`，避免调用方传内联函数时在 React Strict Mode 下造成 effect 频繁触发。
- AuthGate 的跳转 effect 依赖数组只保留 `[status, mustChangePassword]`。effect 内部必须显式判断 `status === "unauthenticated"` 或 `mustChangePassword === true` 后再调用 ref 中的回调；如果 ref 中没有回调，才执行内部 fallback。回调和 fallback 都必须幂等。
- `/change-password` 属于受保护路径；AuthProvider 负责自动校验 `/api/auth/me`。
- 未登录访问 `/change-password` 时，`ChangePasswordPage` 只消费 AuthContext 的 `status` 并跳 `/login?redirect=/change-password`，不自行重复调用 `/api/auth/me`。
- 已登录访问 `/change-password` 时允许进入，作为普通改密入口。
- `mustChangePassword=true` 时，除 `/change-password` 外，一律跳 `/change-password`；用户仍可通过按钮调用 `POST /api/auth/logout` 退出。
- 改密成功后，后端撤销其他旧 session、重新签发当前 session 并写入新 cookie，同时返回 `{ user, org, department }`；前端先清空内存中的旧 CSRF token，再用响应体更新 AuthContext，然后进入问答视图或 `/chat`。
- `router.replace("/xxx")` 只能用于已经拆出并真实存在的路由。阶段 3c-7b-1 期间，`LoginPage`、`RegisterPage`、`ChangePasswordPage` 仍在单页壳内，成功后通过 `onAuthenticated`、`onPasswordChanged` 等回调交给父组件 `setView("chat")`。
- 阶段 7b-2 到 7c 之间，若单页壳中的业务 view 触发 AuthGate 未登录跳转，`redirect` 参数应使用 `/?view=<当前view>`，例如 `router.replace("/login?redirect=" + encodeURIComponent("/?view=" + view))`。登录后先解码并校验该 redirect，再由单页壳恢复原业务 view 上下文。
- 阶段 7b-2 到 7c 之间，`LoginPage`、`RegisterPage`、`ChangePasswordPage` 已经是独立路由页，但 `/chat` 尚未拆出；登录、注册或改密成功后执行 `router.push("/")`，由根路径单页壳渲染默认 chat view。
- 阶段 7c 拆出 `/chat` 后，`ChangePasswordPage` 改密成功才改为页面自身执行 `router.replace("/chat")`，不依赖 AuthGate 或 AuthContext 的副作用触发跳转。
- 改密后的 `/api/auth/csrf` 预取是非阻塞操作：成功则缓存新 token，失败只记录日志或静默保留空状态，不阻塞用户进入 `/chat`；后续首次写操作由 apiClient 惰性补取一次。
- `/api/auth/me` 网络错误且非 401 时，不当作未登录，显示“加载失败，请刷新”并提供重试按钮。
- 用户长时间停留页面时，应在路由切换、页面重新可见 `visibilitychange` 或每 30 分钟静默调用一次 `/api/auth/me`，提前发现 session 失效。
- AuthGate 不直接处理 401，只消费 AuthContext 的状态并执行页面跳转。

阶段 3a-3c 单页壳结构必须保持 auth 视图和业务壳互斥，不能把登录、注册、改密页面包进 AppShell：

```tsx
if (view === "login") {
  return <LoginPage onAuthenticated={() => setView("chat")} />;
}

if (view === "register") {
  return <RegisterPage onAuthenticated={() => setView("chat")} />;
}

if (view === "change-password") {
  return <ChangePasswordPage onPasswordChanged={() => setView("chat")} />;
}

return (
  <AuthGate
    onUnauthenticated={() => setView("login")}
    onMustChangePassword={() => setView("change-password")}
  >
    <AppShell
      active={view}
      onNavigate={setView}
      onLogout={async () => {
        try {
          await logout();
        } finally {
          setView("login");
        }
      }}
    >
      {view === "chat" && <ChatPage />}
      {view === "documents" && <IngestionPage />}
      {view === "knowledge" && <KnowledgePage />}
      {view === "admin" && <AdminPage />}
      {view === "account" && <SessionsPanel />}
    </AppShell>
  </AuthGate>
);
```

示例中的 `logout` 可以从 `@/features/auth/api` 导入，也可以使用 AuthContext 暴露的 logout action，但只能选择一个来源，避免一次点击同时调用两套登出逻辑。

阶段 7b-2 到 7c 期间，auth view 已经移出单页壳，但 `/chat`、`/documents` 尚未拆出。此时单页壳结构应调整为：

```tsx
return (
  <AuthGate
    onUnauthenticated={() =>
      router.replace(
        "/login?redirect=" + encodeURIComponent("/?view=" + view),
      )
    }
    onMustChangePassword={() => router.replace("/change-password")}
  >
    <AppShell
      active={view}
      onNavigate={setView}
      onLogout={async () => {
        await logout().catch(() => {});
        router.replace("/login");
      }}
    >
      {view === "chat" && <ChatPage />}
      {view === "documents" && <IngestionPage />}
      {view === "knowledge" && <KnowledgePage />}
      {view === "admin" && <AdminPage />}
      {view === "account" && <SessionsPanel />}
    </AppShell>
  </AuthGate>
);
```

这个阶段的 `onUnauthenticated` 必须保留 `/?view=<当前view>`，否则用户从单页壳中的 knowledge、admin 或 account 被打断后，登录回来只能落到默认 view，丢失上下文。

阶段 3c-7e 期间，`account` view 直接渲染 `SessionsPanel`，不额外新增 `features/auth/AccountPage.tsx` 容器。阶段 7e 拆出 `/account` 时，`app/account/page.tsx` 也直接组合账号信息区域和 `SessionsPanel`；只有当账号页承载更多个人设置、组织资料或安全设置时，才新增 `features/auth/AccountPage.tsx`。

阶段 3a-3b 尚未引入强制改密闭环时，可以暂不渲染 `change-password` 分支；阶段 3c 引入 `POST /api/auth/change-password` 和强制改密测试入口后，必须补齐该分支与 `onMustChangePassword`。

登录页和注册页的已登录跳转：

- `LoginPage`、`RegisterPage` 内部读取 AuthContext 的 `status`。
- 阶段 3a-7b-1 期间，`LoginPage`、`RegisterPage` 作为单页内联 auth view 使用时，不实现“已登录自动跳转”的页面级 `useEffect`；登录或注册成功后只调用父组件传入的 `onAuthenticated`，由单页壳 `setView("chat")`。
- 从阶段 7b-2 拆成独立路由页开始，`LoginPage`、`RegisterPage` 才实现监听 `status` 与 `mustChangePassword` 的 `useEffect`。
- 如果 `status === "authenticated"` 且 `mustChangePassword=false`，7b-2 到 7c 之间的独立 `LoginPage`/`RegisterPage` 执行 `router.push("/")`，由根路径单页壳渲染默认 chat view；阶段 7c 后才执行 `router.replace("/chat")`。
- 阶段 3c 之前，后端尚无管理员重置和强制改密闭环，`mustChangePassword` 视为恒 `false`，前端无需处理 change-password view。
- 阶段 3c 起，如果 `status === "authenticated"` 且 `mustChangePassword=true`，3c-7b-1 期间通过父组件回调切到单页 change-password view；7b-2 起执行 `router.replace("/change-password")`。
- 该跳转必须放在监听 `status` 和 `mustChangePassword` 的 `useEffect` 中，不能只在组件 mount 时判断一次。
- 当 `status === "loading"` 时可以正常展示表单，但提交按钮应避免重复提交；一旦状态变为 authenticated，effect 必须立即跳转。
- 这段逻辑不放在 AuthGate 中，因为 AuthGate 不包登录页和注册页。

AuthProvider 挂载位置：

- 本期不引入 `(auth)`、`(app)` 路由组，避免在结构迁移阶段同时改变路由组织方式。
- `AuthProvider` 挂在 `app/layout.tsx` 根布局，让登录页、注册页、改密页和业务页都能读取统一认证状态。
- `/change-password` 不属于公开路径；它要求用户已经登录，只是允许 `mustChangePassword=true` 的用户进入。
- AuthProvider 在所有路由都调用 `/api/auth/me`，并统一传 `{ skipAuthRedirect: true }`。
- 当 AuthProvider 完成校验且 `status === "authenticated"` 时，LoginPage/RegisterPage 内部 effect 再执行跳转。
- 已登录访问 `/login`、`/register` 的跳转只由 LoginPage/RegisterPage 内部 `useEffect` 触发，监听 `status` 与 `mustChangePassword` 变化；AuthProvider 不主动跳转，AuthGate 不参与，也不在 mount 时同步跳转。
- LoginPage/RegisterPage 不自行调用 `/api/auth/me`，避免双请求和状态竞争。
- AuthProvider 发起的所有自动 `/api/auth/me` 调用都必须传 `{ skipAuthRedirect: true }`，由 AuthContext 自己更新状态，避免和 AuthGate 或页面内跳转逻辑重复抢路由。
- 如果 AuthProvider 内部使用 `usePathname()`、`useSearchParams()` 等 Next.js 路由 hook，`app/layout.tsx` 中包裹 AuthProvider 的子树必须放在 `<Suspense>` 内；如果 AuthProvider 不读取路由 hook，则不需要为 AuthProvider 额外加 Suspense。
- 后续如果改用 `(auth)` 和 `(app)` 路由组，需要单独写迁移方案，不和本轮结构迁移混做。

AuthGate 包裹位置：

- 阶段 3a-7b-1 期间，应用仍以单页 `app/page.tsx` 为主，只把 `<AuthGate>` 包在受保护业务视图外层，例如 chat、documents、knowledge、admin、account。
- 阶段 3a-7b-1 期间，`AuthGate` 不直接做路由跳转，而是接受 `onUnauthenticated` 和 `onMustChangePassword` 回调，例如 `<AuthGate onUnauthenticated={() => setView("login")} onMustChangePassword={() => setView("change-password")}>`。
- 阶段 3a-7b-1 期间，当 `status === "unauthenticated"` 时，`AuthGate` 在 `useEffect` 中调用 `onUnauthenticated()`，由单页父组件切换到登录 view；此时不能 `router.replace("/login")`，因为 `/login` 路由尚未拆出。
- 阶段 3c-7b-1 期间，当 `status === "authenticated"` 且 `mustChangePassword=true` 时，`AuthGate` 在 `useEffect` 中调用 `onMustChangePassword()`，由单页父组件切换到改密 view；此时不能 `router.replace("/change-password")`，因为 `/change-password` 路由尚未拆出。
- 阶段 3a-3c 期间不得把 `<AuthGate>` 包在整个单页或包含登录/注册/改密的总壳层外，否则会形成登录死锁。
- 阶段 7b-2 到 7c 期间，从单页壳移除 auth view 后，单页壳传给 AuthGate 的 `onUnauthenticated` 应改为 `router.replace("/login?redirect=" + encodeURIComponent("/?view=" + view))`，`onMustChangePassword` 应改为 `router.replace("/change-password")`。
- 阶段 7c 起，独立业务路由页不再给 AuthGate 传 `onUnauthenticated`、`onMustChangePassword`，AuthGate 检测到未传回调时自动 fallback 到 `router.replace("/login?redirect=<当前路径>")` 或 `router.replace("/change-password")`。
- 阶段 7b-7f 拆分路由后，再把 `<AuthGate>` 逐个迁移到 `app/chat/page.tsx`、`app/documents/page.tsx`、`app/knowledge/page.tsx`、`app/admin/page.tsx`、`app/account/page.tsx`。
- 本期不用路由组，因此每个受保护入口 `app/chat/page.tsx`、`app/documents/page.tsx`、`app/knowledge/page.tsx`、`app/admin/page.tsx`、`app/account/page.tsx` 分别包一层 `<AuthGate>`。
- `AppShell` 放在 `<AuthGate>` 内部或作为 AuthGate 的 child 使用，但 `AppShell` 自身不读取认证状态。
- 如果未来使用 `(app)/layout.tsx`，才可在该 layout 里统一包一次 `<AuthGate>`。

AuthContext 状态管理：

- AuthContext 使用 `useReducer`，不用多个分散 `useState` 管理核心认证状态。
- 建议 action：`AUTH_LOADING`、`AUTH_SUCCESS`、`AUTH_FAILED`、`AUTH_LOGOUT`、`AUTH_REQUIRE_PASSWORD_CHANGE`、`AUTH_PASSWORD_CHANGED`。
- `AUTH_FAILED` 需要区分错误类型：401 设置 `status = "unauthenticated"`；网络错误、超时或服务不可用设置 `status = "error"` 并写入 `error`。
- `csrfReady` 在以下时机重置为 `false`：`AUTH_LOGOUT`、`AUTH_PASSWORD_CHANGED`、CSRF 获取失败、`GET /api/auth/csrf` 返回 401、普通写操作触发 `CSRF_INVALID`。
- CSRF 预取成功后设置 `csrfReady = true`。
- reducer 状态至少包含 `user`、`org`、`department`、`status`、`mustChangePassword`、`initializing`、`csrfReady`、`error`。
- AuthGate 在 `status === "error"` 时渲染“加载失败，请刷新”并提供 `retry()`，由 AuthContext 重新调用 `/api/auth/me`。

Client/Server Component 边界：

- 阶段 3a-7e 的 `app/page.tsx` 必须是 Client Component，用于承载单页壳；阶段 7f 后才改为 Server Component，用 `cookies()` 读取 `session_token` 并 `redirect(session ? "/chat" : "/login")`。
- Next.js 16 中 `cookies()` 按异步 API 使用：`const cookieStore = await cookies()`。
- `app/*/page.tsx` 可以尽量保持 Server Component，只做页面组合。
- `features/*/*.tsx` 业务组件默认是 Client Component，因为需要 `useState`、`useEffect`、AuthContext 或浏览器事件。
- `AuthContext`、`AuthGate`、`AppShell` 均为 Client Component。
- `app/error.tsx` 必须是 Client Component，文件顶部需要 `'use client'`，并接收 `error` 与 `reset` props。
- `app/error.tsx` 的“刷新重试”不能只调用 Next.js 的 `reset()`。如果 AuthContext 暴露 `retry()`，错误页应先调用 `retry()` 重新拉取认证状态，再调用 `reset()` 重渲染错误边界，避免认证初始化失败时按钮无法恢复。
- `app/loading.tsx` 只负责路由级 chunk 加载；认证 loading 由 AuthGate 负责，避免同一页面出现两层 loading。

根路径重定向示例仅在阶段 7f 后启用。阶段 3a-7e 期间，`app/page.tsx` 必须保持单页逻辑，默认 view 随各阶段移除逐步迁移。不能在 7f 前把 `app/page.tsx` 改成纯重定向，否则尚未迁出的 view 会失去入口。

`app/page.tsx` 默认 view 迁移规则：

- 阶段 7a-7b-2：默认 view 为 chat。
- 阶段 7c：chat 和 documents 已迁出，默认 view 改为 knowledge。
- 阶段 7d：knowledge 和 admin 已迁出，默认 view 改为 account。
- 阶段 7e：account 正在迁出，迁出完成后单页壳不再承载业务 view。
- 阶段 7f：删除单页逻辑，改为根路径重定向。

阶段 7b-2 到 7e 期间，单页壳同时支持 `/?view=<view>` 作为过渡入口。7b-2 到 7c 期间用于登录后恢复被 AuthGate 打断的单页业务 view；7c-7e 期间用于路由页中的 Sidebar 跳往尚未拆出的 view，例如 `router.push("/?view=knowledge")`。

阶段 7b-2 到 7e 期间，`app/page.tsx` 是 Client Component，必须用 `useSearchParams()` 读取 `?view=`，不能使用 Server Component 的 `searchParams` prop。使用 `useSearchParams()` 的子树需要放在 `<Suspense>` 内，避免 Next.js 构建时报错。

`app/page.tsx` 读取 `searchParams.view` 后按以下规则处理：

- 必须先使用 `BUSINESS_VIEWS` 校验 `rawView` 是否为合法业务 view。
- view 仍由单页壳承载：渲染该 view。
- view 已迁出到独立路由，即 `ROUTED_VIEWS.has(rawView as BusinessView)`：必须在 `useEffect` 中执行 `router.replace(\`/${rawView}\`)`，并在 render 阶段返回 loading/null，绝不继续渲染单页壳版本。例如 7c 后访问 `/?view=documents` 应跳 `/documents`。
- view 非法、不存在或不在当前阶段能力范围内：回退到当前阶段默认 view。

`app/page.tsx` 不能在 render 阶段直接调用 `router.replace()`。阶段 7b-2 到 7e 的 `?view=` 重定向应采用以下模式：

```tsx
const rawView = searchParams.get("view");
const shouldRedirectToRoutedView =
  rawView &&
  BUSINESS_VIEWS.includes(rawView as BusinessView) &&
  ROUTED_VIEWS.has(rawView as BusinessView);

useEffect(() => {
  if (shouldRedirectToRoutedView) {
    router.replace(`/${rawView}`);
  }
}, [shouldRedirectToRoutedView, rawView, router]);

if (shouldRedirectToRoutedView) {
  return <LoadingState />;
}
```

阶段 7f 后的根路径重定向示例：

```tsx
// app/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function Home() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session_token")?.value;
  redirect(session ? "/chat" : "/login");
}
```

## 4.8 API Client 与错误码

`frontend/lib/apiClient.ts` 统一处理：

- `baseUrl`
- `credentials: "include"`
- 写操作自动携带 CSRF header
- JSON 请求/响应解析
- 401 转换为 `ApiError` 并通知 AuthContext
- SSE 请求的认证错误识别

环境变量：

```env
NEXT_PUBLIC_API_BASE=
```

本地开发有两种方式：

- 方式 A：`NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000`，前端 fetch 跨端口请求后端，必须开启 CORS credentials。
- 方式 B：`NEXT_PUBLIC_API_BASE=` 留空，用 Next.js rewrite 把 `/api` 代理到后端，生产同域部署也沿用 `/api`。

生产推荐方式 B，即前端同域访问 `/api`，由反向代理转发到后端。

错误类型：

```ts
type ApiError = {
  status: number;
  code?: string;
  message: string;
  details?: unknown;
};
```

处理规则：

- `/api/auth/login`、`/api/auth/register`、`GET /api/auth/csrf`、`GET /api/auth/invites/validate` 返回 401 时，不触发全局跳转，由调用方自己展示表单错误、登录过期或邀请码无效提示。
- apiClient 不直接执行 `router.replace`，也不直接决定跳转目标，避免和 AuthGate 形成双跳竞态。
- apiClient 位于 `lib/`，不能 import `features/auth/AuthContext`。必须通过注册回调通知认证状态变化：

```ts
let onUnauthenticated: (() => void) | null = null;

export function setOnUnauthenticated(fn: () => void) {
  onUnauthenticated = fn;
}
```

- AuthProvider 初始化时调用 `setOnUnauthenticated(() => dispatch({ type: "AUTH_FAILED", payload: { reason: "401" } }))`。
- apiClient 或 `streamFetch()` 收到 401 时调用 `onUnauthenticated?.()`，然后抛出 `ApiError`；跳转仍由 AuthGate 统一处理。
- 当请求传入 `{ skipAuthRedirect: true }` 时，apiClient 不调用 `onUnauthenticated`，只抛出 `ApiError`，由调用方自行处理。
- AuthProvider/AuthContext 发起的所有自动 `/api/auth/me` 调用都必须传 `{ skipAuthRedirect: true }`。该 flag 用于 AuthProvider 初始化、静默续期和页面可见性恢复等“调用方已经知道自己在处理 401”的场景，避免双重状态更新。
- AuthProvider 捕获自动 `/api/auth/me` 的 `ApiError` 后，401 设置 `status = "unauthenticated"`；网络错误、超时或服务不可用设置 `status = "error"` 并记录 `error`。
- 登录接口 401 只作为表单错误展示。
- 普通业务请求收到 401 时，apiClient 抛出 `ApiError` 并通过 `setOnUnauthenticated` 注册的回调通知 AuthContext；AuthGate 作为单一跳转点执行 `/login?redirect=<当前路径>`。
- 当前已经在 `/login` 时，AuthGate 或页面不重复 `router.replace("/login")`，避免 401 循环。
- SSE 遇到 401 时先主动 abort，再交给 AuthContext 处理跳转。

| 状态 | 处理 |
|---|---|
| 400 | 透传给表单展示，例如邀请码无效、参数非法 |
| 401 | 白名单内透传；AuthProvider 自动调用的 `/api/auth/me` 只更新 AuthContext 状态；其他受保护接口抛出 `ApiError` 并通知 AuthContext，由 AuthGate 统一跳登录 |
| 403 | 页面展示无权限 |
| 404 | 页面展示资源不存在 |
| 409 | 字段级错误，例如组织名、用户名、邮箱已存在 |
| 422 | 表单校验错误，兼容 FastAPI 默认校验响应 |
| 429 | 展示限流提示，引导稍后再试 |
| 500 | 全局 toast 或错误页，并写入错误上报 |

`NEXT_PUBLIC_API_BASE` 为空时，`apiClient` 应使用空字符串拼接相对路径：

```ts
const baseUrl = process.env.NEXT_PUBLIC_API_BASE ?? "";
const url = `${baseUrl}/api/auth/me`;
```

当 `baseUrl` 为空时，请求会变为 `/api/auth/me`，走同域 rewrite。

`apiClient` 初始化时应校验 `NEXT_PUBLIC_API_BASE`：本地开发如果该值为空，必须确认存在 Next.js rewrite 或同域代理；否则在控制台输出一次 warning，提示请求会打到当前域名的 `/api`。生产同域部署允许为空，不视为错误。

CSRF 处理：

- `GET /api/auth/csrf` 必须在已登录后调用，依赖 `session_token` cookie；本接口自身不需要 `X-CSRF-Token`。
- 登录、注册接口处于未认证状态，本期豁免 CSRF，依赖 `SameSite=Lax`、登录/注册限流和后端账号安全策略。
- 已登录后的改密、登出、文档上传、文档解析、知识库管理、会话删除等写操作必须携带 CSRF。
- `apiClient` 负责给需要 CSRF 的 `POST`、`PUT`、`PATCH`、`DELETE` 请求自动附加 `X-CSRF-Token`。
- CSRF token 来源统一为后端 `/api/auth/csrf` 返回值，前端只存内存；本期不从 cookie 读取 CSRF token。
- 登录或注册成功后，AuthContext 应立即调用 `/api/auth/csrf` 预取 CSRF token，再进入受保护业务页。
- 登录页和注册页的成功跳转应等待 `csrfReady === true`，最多等待 2 秒；如果 2 秒内 CSRF 仍未预取成功，允许先跳转，后续第一次写操作由 apiClient 惰性补取。
- 该等待只优化体验，不是安全边界；任何写操作仍必须在发送前确认 CSRF token 存在或先补取。
- 页面刷新后，如果 `/api/auth/me` 校验成功，AuthContext 应继续调用 `/api/auth/csrf` 预取 CSRF token。
- 进入受保护页面时如果内存中没有 CSRF token，apiClient 可惰性调用一次 `/api/auth/csrf`；获取失败则中止当前写操作。
- `ChangePasswordPage` 调用改密接口前必须先确保内存中存在有效 CSRF token；如果 `/api/auth/csrf` 返回 401，由页面显式跳登录或提示登录已过期。
- 改密成功会重新签发 session，旧 CSRF token 必须视为失效；AuthContext 必须清空旧 token 并重新调用 `/api/auth/csrf`。
- 写操作收到 `403` 且错误码为 `CSRF_INVALID` 时，apiClient 清空内存 CSRF token，重新调用 `/api/auth/csrf` 获取一次新 token，并且只重放原请求一次；重放仍失败则向页面抛出错误。
- apiClient 必须为 CSRF 获取实现模块级 Promise 锁，例如 `let csrfRefreshPromise: Promise<void> | null = null`。多个并发写操作同时遇到 `CSRF_INVALID` 时，只允许第一个请求真正调用 `/api/auth/csrf`，其他请求等待同一个 promise，避免并发刷新、后端限流和二次失败。
- CSRF token 只保存在 `apiClient` 或独立 CSRF 模块的闭包级变量中，例如 `let csrfToken: string | null = null`；不要挂到 `window` 对象，降低 XSS 场景下的直接读取风险。
- `apiClient.ts` 必须加浏览器环境守卫：`const isBrowser = typeof window !== "undefined"`。`csrfToken`、`csrfRefreshPromise`、`logoutPromise` 等闭包状态只允许在浏览器环境中使用；`ensureCsrfToken()`、logout 等依赖 cookie/CSRF 的客户端函数在非浏览器环境调用时应抛出明确错误，避免 Server Component 误 import 后污染模块状态。
- 开发环境建议导出 `__resetApiClientStateForDev()`，仅在 `process.env.NODE_ENV === "development" && isBrowser` 时清空 `csrfToken`、`csrfRefreshPromise`、`logoutPromise`，用于 HMR 后重置僵尸内存状态。该函数不得在生产逻辑中调用。
- `POST /api/auth/logout` 豁免 CSRF 自动重放。logout 是“丢弃本地状态”的操作，任何失败都直接交给调用方执行“清本地状态 + 跳 `/login`”，不需要重取 CSRF 或重放请求。
- `features/auth/api.ts` 的 `logout()` 只负责调用后端、清理 AuthContext/本地内存认证状态并返回结果，不执行 `router.replace`，也不调用 `setView`。UI 层切换由调用方负责；无论 `logout()` 成功、网络失败、401、403、4xx 或 5xx，调用方都必须执行切换。
- `features/auth/api.ts` 的 `logout()` 内部必须实现模块级 Promise 锁，例如 `let logoutPromise: Promise<void> | null = null`。重复点击、键盘连击或多处同时调用 logout 时，只复用同一个进行中的请求；finally 中清理本地认证状态并释放锁。后端 `POST /api/auth/logout` 仍必须保持幂等。
- 普通非 SSE 写请求的 CSRF 自动重放机制必须覆盖 `POST /api/auth/change-password`。因为后端应在业务逻辑前完成 CSRF 校验，第一次因 `CSRF_INVALID` 失败时不会改动密码或重签 session，重放不会造成两次改密。
- `GET /api/auth/csrf` 返回 401 时，白名单只表示 apiClient 不自行跳转；AuthContext 或当前调用方必须把 `status` 置为 `unauthenticated`，由 AuthGate 或页面接手跳转，不能静默忽略。
- `GET`、`HEAD` 请求不携带 CSRF header。
- 如果 CSRF 获取失败，写操作应中止并提示“安全校验失败，请刷新后重试”，不能降级为无 CSRF 请求。

## 4.9 SSE 封装

`features/chat/stream.ts` 单独封装 SSE 解析，但不自行处理认证、cookie 和 CSRF 注入。

实现约束：

- `apiClient` 提供 `streamFetch()`，统一处理 `credentials: "include"`、CSRF header、401 识别和错误对象转换。
- `streamChat()` 必须调用 `apiClient.streamFetch()` 发起 `POST /api/chat/stream`。
- `stream.ts` 只负责读取 response stream、解析 SSE 事件和管理 abort，不直接拼认证 header。
- CSRF token 应在登录成功、刷新恢复登录态或进入受保护页面时预取；预取失败不阻塞页面进入，但 `streamFetch()` 必须在内存无 token 时惰性补取一次，不能绕过 CSRF。

建议签名：

```ts
async function streamFetch(
  url: string,
  init: RequestInit & { skipAuthRedirect?: boolean },
): Promise<Response>;
```

规则：

- `streamFetch()` 在非 2xx 响应时解析错误体并抛出 `ApiError`。
- `streamFetch()` 在 2xx 响应时返回原始 `Response`，由 `streamChat()` 读取 `response.body`。
- `streamFetch()` 不解析 SSE 内容，不返回 JSON，不消费 response stream。
- `streamFetch()` 发起 SSE 请求前必须先通过 apiClient 的 `ensureCsrfToken()` 确保内存中存在 CSRF token。
- `streamFetch()` 不执行 CSRF 自动重放。若 SSE 请求在建立连接前返回 `403 CSRF_INVALID`，直接解析错误体并抛出 `ApiError`，由 UI 提示会话或安全校验已过期，用户主动重试。这样避免长连接已开始或部分消费后被透明重放，导致对话 UI 和上下文错乱。
- `streamFetch()` 必须在消费成功响应的 stream body 之前完成状态码判断；一旦返回 2xx Response 给 `streamChat()`，后续流中断只按普通 SSE 错误处理。

职责：

- `streamChat()` 发起问答请求。
- 读取 response stream。
- 解析 `metadata`、`delta`、`done`。
- 兼容 `\n\n` 和 `\r\n\r\n`。
- 支持 `AbortController`，用户切换会话、离开页面或重新提问时可以中断。
- 收到 401 或认证失效时主动关闭连接，并通过 apiClient 通知 AuthContext；最终由 AuthGate 跳登录。
- React 18 StrictMode 下开发环境可能触发组件重复挂载，`ChatPage` 应使用 `useRef<AbortController | null>` 管理当前流。
- 任何会导致当前会话上下文变化的操作都必须先 abort，包括切换会话、切换知识库、点击历史记录、重新提问和组件 unmount。
- 后端如果发送 `event: error`，`streamChat` 应解析并抛出 `ApiError`；`ChatPage` 捕获后展示错误消息，保留用户输入，允许重试。

建议函数签名：

```ts
type StreamChatParams = {
  sessionId?: string;
  knowledgeBaseId: string;
  question: string;
  onMetadata: (metadata: ChatMetadata) => void;
  onDelta: (text: string) => void;
  onDone: (result: { sessionId: string; citations: Citation[] }) => void;
  onError: (error: ApiError) => void;
  signal?: AbortSignal;
};

function streamChat(params: StreamChatParams): Promise<void>;
```

`features/chat/api.ts` 只放非流式接口：

- `listChatSessions()`
- `getChatSession(id)`
- `createChatSession(payload)`
- `deleteChatSession(id)`

SSE 问答只放在 `stream.ts`，不和会话 CRUD 混放。

## 4.10 依赖规则

避免 feature 之间互相乱引导致循环依赖。

允许依赖方向：

```text
components/ui        <- 所有 feature 可依赖
components/layout    <- 只被 app/ 或页面壳依赖
lib/                 <- 所有 feature 可依赖
hooks/               <- 所有 feature 可依赖
features/auth        <- 所有 feature 可依赖其 hooks/types/api
features/documents   <- chat 可依赖其 api/types，不能直接依赖其页面组件
features/rag         <- chat 可依赖其 types/helper
features/chat        <- 不被 documents/admin 反向依赖
features/admin       <- 不被其他 feature 依赖
```

关键规则：

- feature 之间只通过 `api.ts`、`types.ts`、少量 helper 交互。
- 不直接 import 其他 feature 的页面级组件。
- `components/ui` 不依赖任何 feature。
- `lib` 不依赖 feature。

`features/rag/citation.ts` 只放引用相关纯函数：

- `formatCitation(citation)`
- `citationToDocumentId(citation)`
- `groupCitationsByDocument(citations)`

`Citation` 类型仍放在 `features/chat/types.ts`，因为引用来源直接服务于问答页面。

### 4.11 Import 与配置约定

建议在 `tsconfig.json` 中配置路径别名：

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

迁移后统一使用 `@/lib/apiClient`、`@/features/auth/types` 这类绝对别名，避免大量 `../../../` 相对路径导致移动文件时反复改 import。

导航和跳转规则：

- 阶段 6a-7b-2 期间，`Sidebar` 仍使用 `onNavigate` 做单页 view 切换，不能提前改成指向尚不存在路由的 `<Link>`。
- 阶段 7c-7e 期间，`Sidebar` 进入混合模式：已拆出的入口使用 `<Link>`，未拆出的入口在单页壳中继续使用 `onNavigate`。
- 阶段 7f 起，单页壳消失，`Sidebar` 才彻底改为纯路由版，普通导航统一使用 `<Link>`。
- `Topbar` 等不依赖单页 view 的普通导航可以直接使用 `<Link>`。
- 登录成功、401、强制改密、登出后的跳转必须遵循当前阶段的真实路由状态：目标路由已经存在时优先使用 `router.replace`；阶段 7c 前需要回到单页壳 chat view 时使用 `router.push("/")`；阶段 7b-2 前尚无 auth 路由时只能切换单页壳 auth view。
- 不在 `<Link>` 内写认证逻辑，认证逻辑统一放在 `middleware.ts`、AuthGate 和后端接口。

登录后 redirect 优先级：

1. URL 中合法的 `redirect` 参数。
2. 默认目标按阶段变化：阶段 7c 前使用 `/`，由单页壳渲染默认 chat view；阶段 7c 起使用 `/chat`。

不读取“上次访问页面”作为登录后跳转目标，避免状态来源过多。`redirect` 参数必须 URL 编码，并且只能接受站内已存在路径，防止开放重定向和跳转到尚未拆出的路由。

`redirect` 参数必须使用 `lib/routing.ts` 导出的 `validateRedirectUrl()` 校验，不能直接用完整 redirect 字符串做 `KNOWN_ROUTES.includes()`。校验函数先解析同源 URL，再剥离 query/hash 后用 `pathname` 精确匹配 `KNOWN_ROUTES`；校验通过后原样返回包含 query/hash 的相对地址，确保 `/chat?sessionId=123` 这类合法跳转不会丢失上下文。如果 redirect 指向当前阶段尚不存在的路由，例如阶段 7b-2 到 7c 之间的 `/chat`，必须忽略该 redirect 并使用当前阶段默认目标。

嵌套 query 编码规则：

- redirect 目标只要包含 `?`、`&`、`=` 等 query 字符，就必须先 `encodeURIComponent` 后再拼到 `/login?redirect=`。
- 登录页通过 `URLSearchParams.get("redirect")` 获取到的值已经被解码，不要二次 `decodeURIComponent`；如果来源是手工字符串，最多解码一次并捕获异常。
- 解析后统一调用 `validateRedirectUrl(decodedRedirect, window.location.origin)`；返回 `null` 时使用当前阶段默认目标。
- `/?view=xxx` 属于阶段 7b-2 到 7e 的过渡地址，除校验 `/` 存在外，还必须额外校验 `xxx` 是当前阶段仍由单页壳承载的合法 business view；已迁出的 view 应重定向到对应真实路由，非法 view 回退到当前阶段默认 view。

`userPreferences.ts` 与 `useLocalStorage.ts` 边界：

- `lib/userPreferences.ts` 提供类型化读写函数，例如 `getLastKnowledgeBaseId()`、`setLastKnowledgeBaseId()`、`getSidebarCollapsed()`、`setSidebarCollapsed()`。
- `hooks/useLocalStorage.ts` 是通用 React hook，可在内部复用 `userPreferences.ts` 的 key 约定。
- 两者都不能存储 token、邀请码原始值、临时密码、历史提问、对话内容或任何 secret。
- 历史会话一律从后端拉取，不落在浏览器本地存储中。

### 4.12 Next.js Rewrite 示例

生产推荐前端同域访问 `/api`，由 Next.js 或反向代理转发到后端。示例：

```js
// next.config.js
module.exports = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_URL}/api/:path*`,
      },
    ];
  },
};
```

`.env.example` 建议只放非敏感或占位值：

```env
NEXT_PUBLIC_API_BASE=
BACKEND_URL=http://127.0.0.1:8000
```

### 4.13 Middleware Matcher

`middleware.ts` 必须使用动态增长的白名单 matcher，只覆盖已经真实存在的受保护页面，不处理 `/api/*`、`/_next/*`、静态资源和 favicon。

阶段 7a 初始示例：

```ts
export const config = {
  matcher: [],
};
```

说明：

- matcher 是动态增长白名单，不是一次到位的最终清单。
- 阶段 7a 只部署 `middleware.ts`，`matcher` 保持空数组，避免跳转到尚未存在的 `/login` 或拦截尚未拆出的业务路由。
- 阶段 7b-2 拆出 `/login`、`/register`、`/change-password` 后，只把 `/change-password/:path*` 加入 matcher；`/login` 和 `/register` 是公开页面，不加入 matcher。
- 阶段 7c 拆出 `/chat`、`/documents` 并迁移入口后，加入 `/chat/:path*`、`/documents/:path*`。
- 阶段 7d 拆出 `/knowledge`、`/admin` 并迁移入口后，加入 `/knowledge/:path*`、`/admin/:path*`。
- 阶段 7e 拆出 `/account` 并迁移入口后，加入 `/account/:path*`。
- 阶段 7f 不新增 matcher，只把 `app/page.tsx` 改为根路径重定向。
- `/api/:path*` 不进入 middleware，避免 Next.js rewrite 到后端前被误重定向。
- `/_next/static`、`/_next/image`、`/favicon.ico`、`/public` 下静态文件不进入 middleware。
- middleware 只用于页面导航体验；直接请求后端 API 仍由后端认证依赖返回 401/403。
- 新路由必须完成“新增路由 + 迁移入口 + 移除单页 view”后三件套，再扩展 matcher。

### 4.14 邀请码交互

`InvitePage` 创建邀请码后的交互：

- 邀请码后端规则以 `docs/auth-org-migration-design.md` 的 `POST /api/auth/invites` 与 `GET /api/auth/invites/validate` 为准。
- 创建成功后弹窗展示完整邀请链接，例如 `https://app.example.com/register?invite=<code>`。
- 提供“复制链接”按钮。
- 原始邀请码只在创建成功弹窗中展示一次。
- 关闭弹窗后列表只显示状态字段，例如未使用、已使用、已过期、已撤销、过期时间、创建人。
- 列表不再展示原始邀请码。

### 4.15 管理员重置密码

认证文档中包含 super_admin 重置本组织用户密码的能力。前端落地方式：

- 本期实现 `ResetPasswordModal`，放在 `features/admin/AdminPage.tsx` 的用户管理区域。
- 只有 `super_admin` 可以看到入口并发起重置。
- 不允许前端生成临时密码；临时密码必须由后端生成并只在重置成功弹窗展示一次。
- 关闭弹窗后不再展示临时密码。

## 5. 迁移阶段

### 阶段 1：抽通用类型和工具

目标：

- 新增 `frontend/types/common.ts`
- 新增 `frontend/lib/format.ts`
- 新增 `frontend/lib/routing.ts`，定义 `AuthView`、`BusinessView`、`View`、`BUSINESS_VIEWS`、`ROUTED_VIEWS = new Set()`、`STATIC_KNOWN_ROUTES = ["/"]`、派生 `KNOWN_ROUTES`，以及 `normalizeActiveView()`、`validateRedirectUrl()`。
- 配置 `tsconfig.json` 路径别名 `@/*`
- 迁移 `Role`、通用时间格式化等低风险代码
- 本阶段 `lib/routing.ts` 只定义骨架和导出符号，不接入 Sidebar、AuthGate 或页面跳转逻辑，避免阶段 1 改变运行行为。

不做：

- 不改登录方式
- 不改页面交互
- 不拆路由

验收：

```powershell
cd "F:\求职\产品\企业知识库 RAG 问答系统运营项目\Enterprise-Knowledge-Base-RAG-Q-A-Operations-Project\frontend"
npm run build
```

页面视觉和行为与迁移前一致。

`frontend/lib/routing.ts` 文件存在，且能导出 `AuthView`、`BusinessView`、`View`、`BUSINESS_VIEWS`、`ROUTED_VIEWS`、`STATIC_KNOWN_ROUTES`、`KNOWN_ROUTES`、`normalizeActiveView()`、`validateRedirectUrl()`。其中 `ROUTED_VIEWS` 初始为空，`STATIC_KNOWN_ROUTES` 初始只包含 `/`。

### 阶段 2：抽 API Client

目标：

- 新增 `frontend/lib/apiClient.ts`
- 抽出 `API_BASE`
- 抽出 `authenticatedFetch`
- 为后续 cookie session 预留 `credentials: "include"`
- 加入 `isBrowser` 环境守卫，确保 CSRF、logout 等客户端闭包状态不会在 Server Component 或 SSR 环境中被误用。
- 开发环境可导出 `__resetApiClientStateForDev()`，用于 HMR 后清空 apiClient 模块级内存状态。
- 补充 `.env.example` 和 `next.config.js` rewrite 示例

验收：

- 登录后知识库列表可加载。
- 上传、解析、问答接口仍可用。
- 401 仍能按当前逻辑处理。
- 非浏览器环境调用 CSRF/logout 客户端状态函数时抛出明确错误。
- `npm run build` 通过。

### 阶段 3a：迁移登录、AuthContext、apiClient 和类型

目标：

- 新增 `features/auth/LoginPage.tsx`
- 新增 `features/auth/AuthContext.tsx`
- 新增 `features/auth/hooks.ts`，只放 `useAuth()` 和必要的轻量派生 hook，例如 `useMustChangePassword()`
- 新增 `features/auth/api.ts`
- 新增 `features/auth/types.ts`
- 登录、登出、恢复登录态集中到 auth feature。
- `apiClient` 接入 `credentials: "include"`、401 白名单和错误码解析。
- 同步修改 `app/layout.tsx` 挂载 AuthProvider。
- 同步修改 `app/page.tsx`，把内联 `LoginPage` 替换为 `@/features/auth/LoginPage`，并删除对应内联实现。
- 补齐 3a-6a 期间的 logout 宿主层契约：`Topbar`、`AppShell` 尚未迁移，仍在 `app/page.tsx` 内联；本阶段内联 `AppShell` 接受 `onLogout?: () => void` 并透传给内部 `Topbar`，由单页壳调用方传入实现；`Topbar`、`AppShell` 都不读取 AuthContext。

与认证迁移关系：

- 当前阶段可以继续兼容 token。
- 等认证组织迁移进入 cookie 阶段后，再把 auth API 切到 cookie session。
- cookie 化后不再把 token 写入本地存储，只保留 `userPreferences.ts` 保存非敏感 UI 偏好。

验收：

- 登录成功进入问答页面。
- 刷新页面仍可恢复登录态。
- 登出后切到单页壳 `login` view；7b-2 拆出 auth 路由后，改为 `router.replace("/login")`。即使 logout 请求出现网络错误、401、403、4xx 或 5xx，前端也必须清理本地认证状态再切换或跳转。
- `features/auth/api.ts` 的 `logout()` 内部不跳转；`Topbar` 点击登出后由宿主层完成 `setView("login")` 或后续阶段的 `router.replace("/login")`。
- `app/page.tsx` 中不再保留 `LoginPage` 内联实现。
- `npm run build` 通过。

前置后端能力：

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/auth/csrf`

### 阶段 3b：迁移注册与邀请码

目标：

- 新增 `features/auth/RegisterPage.tsx`
- 新增 `features/admin/InvitePage.tsx`，作为系统管理页的邀请码 tab。
- 邀请码 API 放在 `features/auth/api.ts`：`createInvite`、`listInvites`、`revokeInvite`。
- `features/admin/api.ts` 只负责用户、部门等管理接口，避免邀请能力分散。
- 注册页读取 `/register?invite=xxx`，自动填充邀请码，允许用户修改。
- 读取 `searchParams.invite` 后立即使用 `window.history.replaceState` 清理 URL，减少浏览器历史、Referer 和代理日志暴露邀请码的概率。
- 同步修改 `app/page.tsx`，把内联 `RegisterPage` 替换为 `@/features/auth/RegisterPage`，并删除对应内联实现。
- 本阶段先把 `InvitePage` 挂到当前单页 `page.tsx` 的系统管理 view 中；阶段 6c 再迁移完整 `AdminPage` 并把它作为子组件引入。

验收：

- 注册创建组织成功，并自动登录进入 chat view（阶段 7c 前）或 `/chat`（阶段 7c 后）。
- 使用邀请码注册加入已有组织成功，并自动登录进入 chat view（阶段 7c 前）或 `/chat`（阶段 7c 后）。
- 普通用户看不到邀请码管理入口。
- `app/page.tsx` 中不再保留 `RegisterPage` 内联实现。
- `npm run build` 通过。

前置后端能力：

- `POST /api/auth/register`
- `POST /api/auth/invites`
- `GET /api/auth/invites`
- `DELETE /api/auth/invites/{id}`
- `GET /api/auth/invites/validate?code=...`

### 阶段 3c：迁移强制改密和个人认证会话

目标：

- 新增 `features/auth/ChangePasswordPage.tsx`
- 新增 `features/auth/SessionsPanel.tsx`
- AuthGate 支持 `must_change_password` 强制跳转。
- 个人认证会话只允许用户查看和撤销自己的 session。
- 同步修改 `app/page.tsx`，把内联 `ChangePasswordPage` 和个人会话区域替换为 `@/features/auth/ChangePasswordPage`、`@/features/auth/SessionsPanel`，并删除对应内联实现。

验收：

- `must_change_password=true` 时强制进入改密页。
- 改密成功后清空旧 CSRF token，使用接口返回的 `{ user, org, department }` 更新 AuthContext，进入 chat view（阶段 7c 前）或 `/chat`（阶段 7c 后），并以非阻塞方式重新预取 CSRF token。
- 用户只能查看和撤销自己的认证会话。
- `app/page.tsx` 中不再保留 `ChangePasswordPage`、`SessionsPanel` 内联实现。
- `npm run build` 通过。

前置后端能力：

- `POST /api/auth/change-password`
- `GET /api/auth/sessions`
- `DELETE /api/auth/sessions/{id}`
- `POST /api/admin/users/{id}/reset-password`，或测试环境 fixture 直接把指定用户置为 `must_change_password=true`。没有这个入口时，强制改密页面只能手工改库验证，不算闭环。

### 阶段 4a：迁移 documents 展示组件

目标：

- 新增 `features/documents/DocumentTable.tsx`
- 新增 `features/documents/DocumentDetailModal.tsx`
- 只迁移纯展示和弹窗，不迁移上传/解析业务流
- 同步修改 `app/page.tsx`，把对应文档表格和详情弹窗内联实现替换为 feature import，并删除对应内联实现。

验收：

- 文档列表渲染不变。
- 查看文件弹窗展示不变。
- `app/page.tsx` 中不再保留 `DocumentTable`、`DocumentDetailModal` 内联实现。
- `npm run build` 通过。

### 阶段 4b：迁移 IngestionPage

目标：

- 新增 `features/documents/IngestionPage.tsx`
- 新增 `features/documents/api.ts`
- 新增 `features/documents/types.ts`
- 同步修改 `app/page.tsx`，把内联 `IngestionPage` 替换为 `@/features/documents/IngestionPage`，并删除对应内联实现。

验收：

- 文档上传仍创建待解析记录。
- 点击解析后 chunk 数回写。
- 查看文件能打开详情。
- 刷新文件不会清空真实数据。
- `app/page.tsx` 中不再保留 `IngestionPage` 内联实现。
- `npm run build` 通过。

### 阶段 4c：迁移 KnowledgePage

目标：

- 新增 `features/documents/KnowledgePage.tsx`
- 知识库卡片、查看入库文件、创建知识库逻辑从 `page.tsx` 移出
- 同步修改 `app/page.tsx`，把内联 `KnowledgePage` 替换为 `@/features/documents/KnowledgePage`，并删除对应内联实现。

验收：

- 知识库统计显示不变。
- 进入问答、入库文档、查看入库文件三个入口行为不变。
- `app/page.tsx` 中不再保留 `KnowledgePage` 内联实现。
- `npm run build` 通过。

### 阶段 5a：迁移 chat 展示组件

目标：

- 新增 `features/chat/MessageList.tsx`
- 新增 `features/chat/Composer.tsx`
- 新增 `features/chat/types.ts`
- 同步修改 `app/page.tsx`，把消息列表和输入框内联实现替换为 `@/features/chat/MessageList`、`@/features/chat/Composer`，并删除对应内联实现。阶段 5a 尚未拆出 `ChatPage`，不新增临时 chat 容器。

验收：

- 消息列表展示不变。
- 输入和发送按钮布局不变。
- `app/page.tsx` 中不再保留 `MessageList`、`Composer` 内联实现。
- `npm run build` 通过。

### 阶段 5b：迁移 CitationPanel

目标：

- 新增 `features/chat/CitationPanel.tsx`
- 引用来源渲染和点击回调从 `ChatPage` 中拆出
- 同步修改 `app/page.tsx`，把引用来源内联实现替换为 `@/features/chat/CitationPanel`，并删除对应内联实现。阶段 5b 仍不新增临时 chat 容器。

验收：

- 引用来源只展示本次召回结果。
- 引用卡片可打开文档详情。
- `app/page.tsx` 中不再保留 `CitationPanel` 内联实现。
- `npm run build` 通过。

### 阶段 5c：迁移 ChatPage 与 SSE 封装

目标：

- 新增 `features/chat/ChatPage.tsx`
- 新增 `features/chat/api.ts`
- 新增 `features/chat/stream.ts`
- 同步修改 `app/page.tsx`，把内联 `ChatPage` 替换为 `@/features/chat/ChatPage`，并删除对应内联实现。

验收：

- SSE 能正确显示流式回答。
- metadata、delta、done 事件仍被完整消费。
- 401 时关闭 SSE，通知 AuthContext，并由 AuthGate 跳登录。
- SSE 请求前必须确保 CSRF token 存在；SSE 收到 `CSRF_INVALID` 时不自动重放，只抛出错误并允许用户主动重试。
- 支持 AbortController 中断。
- `app/page.tsx` 中不再保留 `ChatPage` 内联实现。
- `npm run build` 通过。

前置后端能力：

- `POST /api/chat/stream`
- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/{id}`
- `DELETE /api/sessions/{id}`

### 阶段 5d：迁移 HistoryPage

目标：

- 新增 `features/chat/HistoryPage.tsx`
- 同步修改 `app/page.tsx`，把内联 `HistoryPage` 替换为 `@/features/chat/HistoryPage`，并删除对应内联实现。

验收：

- 问答历史仍来自后端。
- `app/page.tsx` 中不再保留 `HistoryPage` 内联实现。
- `npm run build` 通过。

### 阶段 6a：迁移 layout 组件

目标：

- `Sidebar`、`Topbar`、`AppShell` 移到 `components/layout`
- `Topbar`、`AppShell` 保留阶段 3a 已引入的 `onLogout?: () => void` prop。
- `AppShell` 继续把 `onLogout` 透传给 `Topbar`，不改变 prop 签名。
- `Topbar`、`AppShell` 迁移后仍不读取 AuthContext，也不直接调用 `logout()`；宿主层继续负责登出后的 view 切换或路由跳转。
- 阶段 6a 的 `Sidebar` 仍服务于单页 `view` 切换，不引入路由 `<Link>`。
- 阶段 6a 初版接口：

```ts
type SidebarProps = {
  active: View;
  onNavigate: (view: View) => void;
};
```

Sidebar 接口演进：

- 阶段 6a-7b-2：只使用单页版接口 `{ active: View; onNavigate: (view: View) => void }`。
- 阶段 7c-7e：扩展为混合接口。路由页传 pathname 且不传 `onNavigate`；单页壳传 view 名和 `onNavigate={setView}`。

```ts
type SidebarProps = {
  active: View | `/${View}`;
  onNavigate?: (view: View) => void;
};
```

- 混合期 Sidebar 内部必须先归一化 `active`，例如去掉前导 `/` 后再和菜单项的 `view` 比对；否则路由页传 `/chat` 时无法高亮 `chat` 菜单。
- 混合期 Sidebar 必须从 `lib/routing.ts` 读取 `ROUTED_VIEWS`，不能在组件内部硬编码当前阶段。
- Sidebar 遍历菜单项时按统一规则渲染：

```ts
if (ROUTED_VIEWS.has(view)) {
  return <Link href={`/${view}`}>{label}</Link>;
}

if (onNavigate) {
  return <button onClick={() => onNavigate(view)}>{label}</button>;
}

return <button onClick={() => router.push(`/?view=${view}`)}>{label}</button>;
```

- 阶段 7f 起：单页壳消失，Sidebar 改为纯路由版，删除 `onNavigate` 和 `View` 相关兼容代码。

验收：

- 所有导航仍可切换。
- 登录角色展示正常。
- `npm run build` 通过。

### 阶段 6b：迁移 UI 组件

目标：

- `Card`、`DataTable`、`EmptyState`、`Modal` 移到 `components/ui`
- 新增 `Skeleton.tsx`、`Spinner.tsx`

验收：

- 所有卡片、表格、空状态、弹窗样式不变。
- `npm run build` 通过。

### 阶段 6c：迁移 AdminPage

目标：

- 新增 `features/admin/AdminPage.tsx`
- 同步修改 `app/page.tsx`，把内联 `AdminPage` 替换为 `@/features/admin/AdminPage`，并删除对应内联实现。

验收：

- 系统管理页展示不变。
- 邀请码 tab 的权限入口展示正常。
- 将阶段 3b 已完成的 `InvitePage` 作为 `AdminPage` 子组件引入，不重复实现邀请码逻辑。
- `app/page.tsx` 中不再保留 `AdminPage` 内联实现。
- `npm run build` 通过。

### 阶段 6d：迁移 WorkflowPage

目标：

- 新增 `features/rag/WorkflowPage.tsx`
- 同步修改 `app/page.tsx`，把内联 `WorkflowPage` 替换为 `@/features/rag/WorkflowPage`，并删除对应内联实现。

验收：

- 流程图页展示不变。
- `app/page.tsx` 中不再保留 `WorkflowPage` 内联实现。
- `npm run build` 通过。

### 阶段 7a：新增 middleware.ts

目标：

- 在 `frontend/middleware.ts` 中先部署 middleware 文件，但 `matcher` 初始保持空数组 `[]`。
- 阶段 7a 不拦截任何路径，不跳 `/login`，避免跳转到尚未拆出的登录路由或拦截尚未存在的业务路由。
- 每拆出一个新受保护路由，并完成入口迁移和单页 view 移除后，再把该路径加入 matcher。

边界：

- 阶段 7a 空 matcher 时，cookie 检查逻辑存在但不生效。
- 从阶段 7b-2 起，已加入 matcher 的受保护路由如果 cookie 不存在，middleware 直接跳登录，减少页面闪烁。
- cookie 存在但 session 已撤销或过期：middleware 放行，由 AuthContext 调 `/api/auth/me` 后处理 401。
- cookie 存在且用户必须改密：middleware 放行，由 AuthGate 根据 `/api/auth/me` 的 `must_change_password` 跳 `/change-password`。
- middleware 不是安全边界，后端接口仍必须做认证和权限校验。

验收：

- middleware 文件存在，matcher 为 `[]`，不改变当前页面行为。
- 直接访问 `/chat`、`/documents`、`/knowledge` 等尚未拆出的路由时，不因为 middleware 被重定向到不存在的页面。
- 后端接口仍独立返回 401/403。
- `npm run build` 通过。

### 阶段 7b-1：新增 App Router 约定文件

目标：

- 新增 `app/loading.tsx`
- 新增 `app/error.tsx`
- 新增 `app/not-found.tsx`

验收：

- 路由加载态、错误边界、404 页面可正常显示。
- `app/error.tsx` 顶部包含 `'use client'`。
- `npm run build` 通过。

### 阶段 7b-2：拆分 auth 路由

目标：

- 新增 `app/login/page.tsx`
- 新增 `app/register/page.tsx`
- 新增 `app/change-password/page.tsx`
- 三个 auth 页面使用独立 auth 布局，不包含 Sidebar、Topbar、AppShell。
- 本阶段同步更新 `STATIC_KNOWN_ROUTES`：加入 `/login`、`/register`、`/change-password`；`KNOWN_ROUTES` 继续由 `STATIC_KNOWN_ROUTES + ROUTED_VIEWS` 派生，不能手工维护。
- 本阶段同步更新 middleware matcher：只加入 `/change-password/:path*`，不加入公开的 `/login`、`/register`。
- 修改 `features/auth/LoginPage.tsx`、`features/auth/RegisterPage.tsx`，加入监听 `status` 与 `mustChangePassword` 的 `useEffect`；监听逻辑遵循 §4.7“登录页和注册页的已登录跳转”。
- 从 `features/auth/LoginPage.tsx`、`features/auth/RegisterPage.tsx`、`features/auth/ChangePasswordPage.tsx` 中删除 `onAuthenticated`、`onPasswordChanged` 等单页回调 prop 及相关调用逻辑。7b-2 之前依赖这些 prop 的单页壳调用点已在本阶段一并删除，不会出现 prop 悬空。
- 同步更新 `lib/routing.ts`：从 `View` 联合类型中移除 `AuthView`，将 `View` 缩窄为 `BusinessView`；Sidebar 的 `active` 类型同步缩窄，不再接受 `login`、`register`、`change-password`。
- 从单页壳 `app/page.tsx` 中移除 `LoginPage`、`RegisterPage`、`ChangePasswordPage` 三个 auth view 和对应 `View` 枚举值，单页壳不再承载 auth 相关视图。
- 从单页壳移除传给 `<AuthGate>` 的 `onUnauthenticated`、`onMustChangePassword` 中的 auth view 切换逻辑；AuthGate 组件签名继续保留这两个可选回调。7b-2 到 7c 期间，单页壳必须传入带 `redirect=/?view=<当前view>` 的路由回调，例如 `onUnauthenticated={() => router.replace("/login?redirect=" + encodeURIComponent("/?view=" + view))}`；不传回调会导致用户登录后回不到被打断的 view。7c 起独立业务路由页不传回调，由 AuthGate 内部 fallback 到 `router.replace(...)`。

验收：

- 未登录访问 `/login` 正常。
- 已登录访问 `/login` 时，阶段 7c 前跳回 `/`，由根路径单页壳渲染默认 chat view；阶段 7c 起跳 `/chat`。
- 用户提交登录表单成功后，阶段 7c 前执行 `router.push("/")`，由根路径单页壳渲染默认 chat view；阶段 7c 起执行 `router.replace("/chat")`。
- 登录成功遵循 redirect 优先级。
- 注册创建组织成功。
- 使用邀请码注册成功。
- 用户提交注册表单成功后，阶段 7c 前执行 `router.push("/")`，由根路径单页壳渲染默认 chat view；阶段 7c 起执行 `router.replace("/chat")`。
- 读取邀请码后清理 URL。
- 未登录访问 `/change-password` 跳 `/login?redirect=/change-password`。
- 已登录访问 `/change-password` 允许进入。
- `must_change_password=true` 时强制停留在 `/change-password`。
- 改密成功后当前 session 重签发，前端清空旧 CSRF token，使用接口返回的 `{ user, org, department }` 更新 AuthContext；阶段 7b-2 到 7c 之间执行 `router.push("/")`，由根路径单页壳渲染默认 chat view；阶段 7c 后再跳 `/chat`，并以非阻塞方式重新预取 CSRF token。
- 访问 `/` 时不会再渲染 auth view。
- `npm run build` 通过。

### 阶段 7c：拆分 /chat 与 /documents

目标：

- 新增 `app/chat/page.tsx`
- 新增 `app/documents/page.tsx`
- 从本阶段开始，Sidebar 进入混合模式。路由页使用当前 pathname 作为 `active`，不传 `onNavigate`；单页壳继续传当前 view 作为 `active`，并保留 `onNavigate={setView}`。
- Sidebar 不硬编码阶段状态，必须读取 `lib/routing.ts` 中的 `ROUTED_VIEWS` 决定每个入口渲染为 `<Link>`、`onNavigate` 按钮还是 `/?view=` 过渡按钮。
- 同步更新 `lib/routing.ts`：`ROUTED_VIEWS` 增加 `chat`、`documents`，使 Sidebar 和 redirect 校验都能识别这两个路由已经存在。
- Sidebar 自动按 `ROUTED_VIEWS` 将问答、文档入库入口渲染为 `<Link href="/chat">`、`<Link href="/documents">`，不要在 Sidebar 内为阶段 7c 写死特殊判断。
- Sidebar 高亮必须调用 `normalizeActiveView(active)`，不能自行字符串截取。
- 尚未拆出的 knowledge、admin/account 入口在单页壳中继续通过 `onNavigate` 切换 view；在 `/chat`、`/documents` 等独立路由页中使用 `router.push("/?view=knowledge")` 这类 query 过渡入口回到单页壳。
- 从单页 `app/page.tsx` 中移除 chat view，避免 `/` 和 `/chat` 两套问答实现并存。
- 从单页 `app/page.tsx` 中移除 documents view，避免 `/` 和 `/documents` 两套文档入库实现并存。
- 可新增独立校验脚本或 `prebuild` 检查：凡已进入 `ROUTED_VIEWS` 的 view，不允许在 `app/page.tsx` 中继续保留对应内联渲染或重新 import 已迁出的页面组件。
- 单页壳默认 view 从 `chat` 改为 `knowledge`，避免访问 `/` 时渲染已迁出的 chat/documents view。
- 完成以上三件套后，在 middleware matcher 中加入 `/chat/:path*`、`/documents/:path*`。

验收：

- 登录后访问 `/chat` 正常。
- 刷新 `/chat` 仍在线。
- 问答、引用、历史行为不变。
- 未登录访问 `/documents` 跳 `/login?redirect=/documents`。
- 登录后跳回 redirect。
- 文档上传、解析、查看详情行为不变。
- 直接访问 API 未授权仍返回 401。
- `npm run build` 通过。

注意：

- 这一步应放在认证 cookie 化稳定之后。
- 前端 route guard 只负责 UX，不是安全边界。
- 后端接口权限不能依赖前端路由。
- 本阶段后，Sidebar 在路由页不再支持单页 view 切换；单页壳仍保留 `onNavigate`，直到阶段 7f 单页壳彻底消失。

### 阶段 7d：拆分 /knowledge 与 /admin

目标：

- 新增 `app/knowledge/page.tsx`
- 新增 `app/admin/page.tsx`，承接 `features/admin/AdminPage.tsx`。
- 同步更新 `lib/routing.ts`：`ROUTED_VIEWS` 增加 `knowledge`、`admin`。
- Sidebar 自动按 `ROUTED_VIEWS` 将知识库、系统管理入口渲染为 `<Link href="/knowledge">`、`<Link href="/admin">`，不要在 Sidebar 内为阶段 7d 写死特殊判断。
- 从单页 `app/page.tsx` 中移除 knowledge view，避免 `/` 和 `/knowledge` 两套知识库实现并存。
- 从单页 `app/page.tsx` 中移除 admin view，避免 `/` 和 `/admin` 两套系统管理实现并存。
- 单页壳默认 view 从 `knowledge` 改为 `account`，避免访问 `/` 时渲染已迁出的 knowledge/admin view。
- 完成以上三件套后，在 middleware matcher 中加入 `/knowledge/:path*`、`/admin/:path*`。

验收：

- 未登录访问 `/knowledge` 跳 `/login?redirect=/knowledge`。
- 登录后跳回 redirect。
- 知识库管理、进入问答、查看入库文件行为不变。
- 普通用户访问 `/admin` 显示无权限或重定向。
- 直接访问 API 未授权仍返回 401。
- `npm run build` 通过。

### 阶段 7e：拆分 /account

目标：

- 新增 `app/account/page.tsx`，承接账号信息和 `features/auth/SessionsPanel.tsx`。
- 同步更新 `lib/routing.ts`：`ROUTED_VIEWS` 增加 `account`。
- Sidebar 自动按 `ROUTED_VIEWS` 将账号入口渲染为 `<Link href="/account">`，不要在 Sidebar 内为阶段 7e 写死特殊判断。
- 从单页 `app/page.tsx` 中移除 account 相关 view。
- 完成以上三件套后，在 middleware matcher 中加入 `/account/:path*`。

验收：

- 未登录访问 `/account` 跳登录。
- 已登录用户可访问 `/account` 并管理自己的认证会话。
- `npm run build` 通过。

### 阶段 7f：根路径改为重定向

目标：

- 确认 chat、documents、knowledge、admin、account 都已从单页迁出。
- `app/page.tsx` 只保留根路径重定向逻辑：`redirect(session ? "/chat" : "/login")`。

验收：

- 未登录访问 `/` 跳 `/login`。
- 已登录访问 `/` 跳 `/chat`。
- 不存在只能通过 `/` 访问的业务 view。
- `npm run build` 通过。

## 6. 与认证迁移的关系

前端结构迁移和认证组织迁移可以并行规划，但不建议混在同一次大改中。

推荐顺序：

```text
前端阶段 1-2：先抽类型和 apiClient
后端认证阶段 1-4：组织、session、cookie、org_id 过滤
前端阶段 3a-3c：auth feature 对接 cookie session、注册邀请、强制改密
前端阶段 4-5：documents/chat feature 小步迁移
前端阶段 6-7：layout/ui 和路由拆分
```

这样做的原因：

- `apiClient` 是 cookie 化的前置基础。
- auth feature 可以承接登录态变化。
- documents/chat 是核心业务，不要和底层认证表迁移在同一批大改中拆。
- App Router 路由拆分会影响登录跳转和页面状态，最好在 cookie session 稳定之后做。

## 6.1 前端安全与日志

- `NEXT_PUBLIC_*` 变量会被打包进浏览器，不能放任何密钥、服务端 token、飞书 secret 或数据库连接信息。
- 如果采用 Next.js rewrite 代理 `/api` 到后端，后端地址可使用服务端环境变量，不需要暴露为 `NEXT_PUBLIC_*`。
- 前端日志、错误上报和调试输出不能打印 `session_token`、`invite_code`、临时密码、`Authorization`、`Cookie`、`Set-Cookie`。
- 若后续接入 Sentry 或同类平台，必须配置敏感字段过滤。
- 邀请链接由 super_admin 手动复制发送，MVP 不做邮件投递；邀请码原始值只展示一次，不写日志。
- 注册页读取 URL 中的邀请码后，应立即使用 `window.history.replaceState` 清理地址栏，减少邀请码进入浏览器历史、Referer、CDN 或反向代理日志的概率。

## 6.2 多标签页状态同步

登出、session 失效、强制改密等认证状态变化需要同步到多个浏览器标签页。

推荐：

- 优先使用 `BroadcastChannel("auth")` 广播 `logout`、`session-expired`、`password-required`。
- 兼容方案使用统一 key，例如 `auth:state-change`，写入 `${action}:${crypto.randomUUID()}` 触发 `storage` 事件；监听方收到后清理内存用户状态并跳登录。
- 写入 localStorage fallback 后应使用短延迟 `removeItem("auth:state-change")` 清理该 key，避免长期残留。不要使用纯时间戳作为事件值，避免极端并发下重复值导致事件不触发。
- `storage` 监听器必须显式判断 `event.key === "auth:state-change"` 且 `event.newValue` 非空后再处理。`removeItem("auth:state-change")` 也会触发其他标签页的 `storage` 事件，此时 `event.newValue === null`，只能视为清理事件，不能再次触发登出、跳转或请求取消。
- 任一标签页登出后，其他标签页应清理内存用户状态并跳 `/login`。
- 启动时检测 `typeof BroadcastChannel !== "undefined"`。
- 支持 BroadcastChannel 时只用 BroadcastChannel；不支持时才降级到 localStorage `storage` 事件。
- 不同时启用两套广播，避免同一事件重复触发。

localStorage fallback 监听示例：

```ts
const AUTH_EVENT_KEY = "auth:state-change";
const AUTH_ACTIONS = new Set(["logout", "session-expired", "password-required"]);

window.addEventListener("storage", (event) => {
  if (event.key !== AUTH_EVENT_KEY || !event.newValue) return;

  const [action] = event.newValue.split(":");
  if (!AUTH_ACTIONS.has(action)) return;

  handleAuthStateChange(action);
});
```

## 6.3 最小 E2E 策略

认证和路由拆分完成后，建议补充 Playwright 或 Cypress 最小用例：

- 未登录访问 `/chat` 跳 `/login?redirect=/chat`。
- 未登录访问 `/` 跳 `/login`。
- 登录成功后跳回原 redirect。
- 刷新 `/chat` 后仍在线。
- 登出后 `/api/auth/me` 返回 401，页面跳 `/login`。
- `must_change_password=true` 时访问 `/chat` 被强制跳 `/change-password`。
- 普通用户访问邀请码管理页返回无权限或不可见。
- 注册创建组织成功，并自动登录进入 `/chat`。
- 使用邀请码注册加入已有组织成功。
- 多标签页中一个标签登出，其他标签同步跳 `/login`。
- 前端触发的跨组织访问接口返回 403 或 404，不展示其他组织数据。
- 后端发送 SSE `event: error` 时，对话区展示错误并保留用户输入。
- 切换知识库或历史会话时，旧 SSE 请求被 abort。

## 7. 回滚策略

- 每个阶段只移动少量文件，并保持导出路径清晰。
- 每个阶段完成后立即跑 `npm run build`。
- 如果 build 失败，优先回滚该阶段新增 import/export，不影响其他阶段。
- 不在迁移文件结构时顺手改 UI、业务规则或接口协议。
- 若出现运行时行为差异，先恢复 `page.tsx` 原有实现，再重新拆更小步骤。
- 路由拆分阶段先保留 `app/page.tsx` 的旧单页逻辑作为 fallback，确认新路由稳定后再缩减为重定向页。
- 如果某个新路由不稳定，可临时在 middleware 或页面入口重定向回 `/`，先恢复演示可用性。
- 每次只拆一个路由并单独 build、验证，不一次性拆 `/chat`、`/documents`、`/knowledge`、`/admin` 多个入口。

## 8. 验收清单

每阶段至少验证：

- `npm run build` 通过。
- 登录、刷新、登出行为不变。
- 知识库列表能加载真实数据。
- 文档上传、解析、查看详情可用。
- 问答 SSE 可用。
- 引用来源可点击。
- 历史会话来自后端。
- 页面视觉布局不明显变化。

## 9. 不做事项

本结构迁移阶段不做：

- 不重写 UI 风格。
- 不替换状态管理库。
- 不引入 Redux/Zustand，除非后续状态复杂度真正需要。
- 不把后端 db、ai、vector 逻辑放进前端 `lib/`。
- 不一次性移动所有组件。
- 不在同一次改动里同时做 App Router 路由拆分和认证 cookie 化。
