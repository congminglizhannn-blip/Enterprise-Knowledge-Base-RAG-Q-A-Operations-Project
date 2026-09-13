"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Archive,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  FileText,
  GitBranch,
  History,
  Home,
  Layers3,
  LockKeyhole,
  LogOut,
  MessageSquareText,
  Search,
  SendHorizontal,
  Settings,
  ShieldCheck,
  UploadCloud,
  UsersRound,
} from "lucide-react";

type View = "dashboard" | "knowledge" | "ingestion" | "chat" | "workflow" | "history" | "admin";
type Role = "超级管理员" | "部门管理员" | "普通用户";
type KnowledgeBase = typeof knowledgeBases[number];
type UploadRow = {
  id?: string;
  kbId: string;
  name: string;
  type: string;
  source: string;
  status: string;
  chunks: number;
  owner: string;
  time: string;
};
type CitationRow = {
  document_id?: string | null;
  document_name: string;
  content_preview: string;
  chunk_id?: string;
  score?: number | null;
};

type DocumentDetail = {
  id: string;
  file_name: string;
  file_type: string;
  status: string;
  chunk_count: number;
  error_message?: string | null;
  chunks: { id: string; chunk_index: number; content: string }[];
};

type FlowStep = {
  title: string;
  desc: string;
  kind?: "start" | "process" | "decision" | "risk" | "done";
};
type UserInfo = {
  id: string;
  username: string;
  role: string;
  department_id: string;
  full_name?: string | null;
};
type ChatMessage = { role: string; content: string };
type ChatSessionSummary = {
  id: string;
  knowledge_base_id: string;
  title: string;
  updated_at: string;
};

const knowledgeBases = [
  { id: "kb-1", name: "产品制度知识库", dept: "产品运营部", docs: 18, chunks: 326, status: "已启用", updated: "2026-09-07 15:20" },
  { id: "kb-2", name: "项目交付流程库", dept: "产品运营部", docs: 12, chunks: 214, status: "解析完成", updated: "2026-09-06 18:42" },
  { id: "kb-3", name: "售后 FAQ 知识库", dept: "客户成功部", docs: 9, chunks: 143, status: "部门隔离", updated: "2026-09-05 11:05" },
];

const users = [
  { name: "super_admin", role: "超级管理员", dept: "全部部门", status: "启用" },
  { name: "dept_admin", role: "部门管理员", dept: "产品运营部", status: "启用" },
  { name: "normal_user", role: "普通用户", dept: "产品运营部", status: "启用" },
  { name: "ops_viewer", role: "普通用户", dept: "客户成功部", status: "停用" },
];

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";
type AuthenticatedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function mapBackendRole(role: string): Role {
  if (role === "super_admin") return "超级管理员";
  if (role === "dept_admin") return "部门管理员";
  return "普通用户";
}

function mapKnowledgeBase(kb: { id: string; name: string; department_id: string }) {
  return {
    id: kb.id,
    name: kb.name,
    dept: kb.department_id,
    docs: 0,
    chunks: 0,
    status: "后端已连接",
    updated: "实时数据",
  };
}

function formatTime(value?: string) {
  if (!value) return "实时数据";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function mapDocument(document: {
  id: string;
  knowledge_base_id: string;
  file_name: string;
  file_type: string;
  status: string;
  chunk_count: number;
  created_at?: string;
}, kbs: KnowledgeBase[]): UploadRow {
  const kb = kbs.find((item) => item.id === document.knowledge_base_id);
  const statusMap: Record<string, string> = {
    pending: "待解析",
    processing: "解析中",
    completed: "解析完成",
    failed: "解析失败",
  };
  const typeMap: Record<string, string> = {
    pdf: "PDF",
    docx: "Word",
    xlsx: "Excel",
    link: "Link",
  };
  return {
    id: document.id,
    kbId: document.knowledge_base_id,
    name: document.file_name,
    type: typeMap[document.file_type] ?? document.file_type,
    source: kb?.name ?? "未知知识库",
    status: statusMap[document.status] ?? document.status,
    chunks: document.chunk_count ?? 0,
    owner: "当前用户",
    time: formatTime(document.created_at),
  };
}

function withKbStats(kbs: KnowledgeBase[], rows: UploadRow[]) {
  return kbs.map((kb) => {
    const docs = rows.filter((row) => row.kbId === kb.id && row.status === "解析完成");
    return {
      ...kb,
      docs: docs.length,
      chunks: docs.reduce((sum, doc) => sum + doc.chunks, 0),
      updated: docs[0]?.time ?? kb.updated,
    };
  });
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [view, setView] = useState<View>("chat");
  const [role, setRole] = useState<Role>("部门管理员");
  const [selectedKb, setSelectedKb] = useState(knowledgeBases[0]);
  const [availableKbs, setAvailableKbs] = useState<KnowledgeBase[]>(knowledgeBases);
  const [authToken, setAuthToken] = useState("");
  const [loginError, setLoginError] = useState("");
  const [notice, setNotice] = useState("");
  const [documentRows, setDocumentRows] = useState<UploadRow[]>([]);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [citations, setCitations] = useState<CitationRow[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    const userInfo = window.localStorage.getItem("user_info");
    if (!token || !userInfo) return;
    restoreLogin(token, JSON.parse(userInfo));
  }, []);

  useEffect(() => {
    window.localStorage.setItem("active_chat_messages", JSON.stringify(messages.slice(-100)));
  }, [messages]);

  const title = useMemo(() => {
    const map: Record<View, string> = {
      dashboard: "运营总览",
      knowledge: "知识库管理",
      ingestion: "文档入库",
      chat: "知识库问答",
      workflow: "流程图",
      history: "问答历史",
      admin: "系统管理",
    };
    return map[view];
  }, [view]);

  if (!loggedIn) {
    return <LoginPage onLogin={handleLogin} role={role} setRole={setRole} loginError={loginError} />;
  }

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={setView} />
      <main className="main-panel">
        <Topbar title={title} role={role} onLogout={handleLogout} />
        {notice && <div className="notice-bar">{notice}</div>}
        {view === "dashboard" && <Dashboard setView={setView} />}
        {view === "knowledge" && (
          <KnowledgePage
            authToken={authToken}
            setView={setView}
            setSelectedKb={setSelectedKb}
            kbs={availableKbs}
            setKbs={setAvailableKbs}
            documentRows={documentRows}
            refreshDocuments={refreshDocuments}
            setNotice={setNotice}
            authenticatedFetch={authenticatedFetch}
          />
        )}
        {view === "ingestion" && (
          <IngestionPage
            authToken={authToken}
            selectedKb={selectedKb}
            availableKbs={availableKbs}
            documentRows={documentRows}
            setDocumentRows={setDocumentRows}
            refreshDocuments={refreshDocuments}
            authenticatedFetch={authenticatedFetch}
          />
        )}
        {view === "chat" && (
          <ChatPage
            selectedKb={selectedKb}
            setSelectedKb={setSelectedKb}
            availableKbs={availableKbs}
            question={question}
            setQuestion={setQuestion}
            messages={messages}
            setMessages={setMessages}
            citations={citations}
            setCitations={setCitations}
            documentRows={documentRows}
            authToken={authToken}
            activeSessionId={activeSessionId}
            setActiveSessionId={setActiveSessionId}
            chatSessions={chatSessions}
            refreshSessions={refreshSessions}
            onUnauthorized={handleUnauthorized}
            authenticatedFetch={authenticatedFetch}
          />
        )}
        {view === "workflow" && <WorkflowPage />}
        {view === "history" && <HistoryPage sessions={chatSessions} messages={messages} setNotice={setNotice} />}
        {view === "admin" && <AdminPage role={role} />}
      </main>
    </div>
  );

  async function handleLogin(username: string, password: string) {
    setLoginError("");
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = await response.json();
      window.localStorage.setItem("auth_token", data.access_token);
      window.localStorage.setItem("refresh_token", data.refresh_token);
      window.localStorage.setItem("user_info", JSON.stringify(data.user));
      await restoreLogin(data.access_token, data.user);
    } catch {
      setLoginError("无法连接后端或账号密码错误。请先启动 FastAPI、数据库，并初始化 Admin/7777。");
    }
  }

  async function restoreLogin(token: string, userInfo: UserInfo) {
    try {
      let meResponse = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (meResponse.status === 401) {
        const refreshedToken = await refreshAccessToken();
        if (!refreshedToken) throw new Error(await meResponse.text());
        token = refreshedToken;
        meResponse = await fetch(`${API_BASE}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      if (!meResponse.ok) throw new Error(await meResponse.text());
      const user = await meResponse.json();
      window.localStorage.setItem("user_info", JSON.stringify(user));
      setAuthToken(token);
      setRole(mapBackendRole(user.role ?? userInfo.role));

      const kbResponse = await fetch(`${API_BASE}/api/kbs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!kbResponse.ok) throw new Error(await kbResponse.text());
      const kbs = (await kbResponse.json()).map(mapKnowledgeBase);
      const rows = await loadDocuments(token, kbs);
      const sessions = await loadSessions(token);
      if (kbs.length > 0) {
        setAvailableKbs(withKbStats(kbs, rows));
        setSelectedKb(kbs[0]);
      }
      setDocumentRows(rows);
      setChatSessions(sessions);
      const cachedMessages = window.localStorage.getItem("active_chat_messages");
      if (cachedMessages) setMessages(JSON.parse(cachedMessages));
      setLoggedIn(true);
      setView("chat");
    } catch {
      handleLogout();
      setLoginError("登录态已失效，请重新登录。");
    }
  }

  function handleUnauthorized() {
    handleLogout();
    setLoginError("登录态已失效，请重新登录后再继续问答。");
  }

  function handleLogout() {
    window.localStorage.removeItem("auth_token");
    window.localStorage.removeItem("refresh_token");
    window.localStorage.removeItem("user_info");
    window.localStorage.removeItem("active_chat_messages");
    setAuthToken("");
    setLoggedIn(false);
    setMessages([]);
    setCitations([]);
    setChatSessions([]);
    setActiveSessionId(null);
  }

  async function loadDocuments(token: string, kbs: KnowledgeBase[]) {
    const lists = await Promise.all(kbs.map(async (kb) => {
      const response = await authenticatedFetch(`${API_BASE}/api/documents?knowledge_base_id=${encodeURIComponent(kb.id)}`);
      if (!response.ok) throw new Error(await response.text());
      const documents = await response.json();
      return documents.map((document: Parameters<typeof mapDocument>[0]) => mapDocument(document, kbs));
    }));
    return lists.flat();
  }

  async function loadSessions(token: string) {
    const response = await authenticatedFetch(`${API_BASE}/api/sessions`);
    if (!response.ok) return [];
    return response.json();
  }

  async function refreshSessions(nextToken = authToken) {
    if (!nextToken) return;
    setChatSessions(await loadSessions(nextToken));
  }

  async function refreshDocuments(nextToken = authToken, nextKbs = availableKbs) {
    if (!nextToken) return;
    try {
      const rows = await loadDocuments(nextToken, nextKbs);
      setDocumentRows(rows);
      setAvailableKbs(withKbStats(nextKbs, rows));
      setNotice("文件列表已刷新。");
    } catch {
      setNotice("刷新文件失败，已保留当前页面数据。");
    }
  }

  async function refreshAccessToken(): Promise<string | null> {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    refreshPromiseRef.current = (async () => {
      const refreshToken = window.localStorage.getItem("refresh_token");
      if (!refreshToken) return null;
      try {
        const response = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!response.ok) return null;
        const data = await response.json();
        window.localStorage.setItem("auth_token", data.access_token);
        window.localStorage.setItem("refresh_token", data.refresh_token);
        setAuthToken(data.access_token);
        return data.access_token as string;
      } catch {
        return null;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();
    return refreshPromiseRef.current;
  }

  async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
    const token = authToken || window.localStorage.getItem("auth_token") || "";
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(input, { ...init, headers });
    if (response.status !== 401) return response;

    const refreshedToken = await refreshAccessToken();
    if (!refreshedToken) {
      handleUnauthorized();
      return response;
    }

    const retryHeaders = new Headers(init.headers);
    retryHeaders.set("Authorization", `Bearer ${refreshedToken}`);
    return fetch(input, { ...init, headers: retryHeaders });
  }
}

function LoginPage({
  onLogin,
  role,
  setRole,
  loginError,
}: {
  onLogin: (username: string, password: string) => void;
  role: Role;
  setRole: (role: Role) => void;
  loginError: string;
}) {
  const [username, setUsername] = useState("Admin");
  const [password, setPassword] = useState("7777");

  return (
    <main className="login-screen">
      <section className="login-hero">
        <div className="eyebrow">Enterprise Knowledge Base</div>
        <h1>企业知识库 RAG 问答系统</h1>
        <p>面向企业内部制度、流程、项目资料的智能检索问答平台，支持部门强隔离、文档入库、引用溯源和流式回答。</p>
        <div className="flow-strip">
          {[
            ["上传资料", UploadCloud],
            ["解析分块", Layers3],
            ["权限检索", ShieldCheck],
            ["流式问答", MessageSquareText],
          ].map(([label, Icon]) => (
            <div className="flow-step" key={label as string}>
              <Icon size={22} />
              <span>{label as string}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="login-card">
        <LockKeyhole className="login-mark" size={34} />
        <h2>登录工作台</h2>
        <p>选择演示角色后进入前端业务原型。</p>
        <label>
          账号
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label>
          密码
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
        </label>
        <label>
          演示角色
          <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
            <option>超级管理员</option>
            <option>部门管理员</option>
            <option>普通用户</option>
          </select>
        </label>
        <button className="primary-btn" onClick={() => onLogin(username, password)}>登录</button>
        {loginError && <div className="form-error">{loginError}</div>}
        <small>真实密钥和企业凭据仅通过环境变量配置，前端不保存敏感信息。</small>
      </section>
    </main>
  );
}

function Sidebar({ view, setView }: { view: View; setView: (view: View) => void }) {
  const items = [
    ["chat", MessageSquareText, "问答工作台"],
    ["dashboard", Home, "运营总览"],
    ["knowledge", BookOpen, "知识库"],
    ["ingestion", UploadCloud, "文档入库"],
    ["workflow", GitBranch, "流程图"],
    ["history", History, "问答历史"],
    ["admin", Settings, "系统管理"],
  ] as const;
  return (
    <aside className="sidebar">
      <div className="brand">
        <Database size={28} />
        <div>
          <strong>企业知识库</strong>
          <span>RAG Operations</span>
        </div>
      </div>
      <nav>
        {items.map(([key, Icon, label]) => (
          <button className={view === key ? "active" : ""} key={key} onClick={() => setView(key)}>
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>
      <div className="sidebar-note">
        <ShieldCheck size={18} />
        SQL 层部门强隔离
      </div>
    </aside>
  );
}

function Topbar({ title, role, onLogout }: { title: string; role: Role; onLogout: () => void }) {
  return (
    <header className="topbar">
      <div>
        <h2>{title}</h2>
        <span>产品运营部 · 作品集展示环境</span>
      </div>
      <div className="topbar-actions">
        <span className="pill"><Building2 size={16} />产品运营部</span>
        <span className="pill"><UsersRound size={16} />{role}</span>
        <button className="icon-btn" onClick={onLogout} title="退出登录"><LogOut size={18} /></button>
      </div>
    </header>
  );
}

function Dashboard({ setView }: { setView: (view: View) => void }) {
  return (
    <section className="page-grid">
      <div className="stats-row">
        <Stat icon={BookOpen} label="知识库" value="5" />
        <Stat icon={FileText} label="文档总数" value="39" />
        <Stat icon={Layers3} label="Chunk 数" value="683" />
        <Stat icon={Activity} label="今日问答" value="28" />
      </div>
      <div className="two-col">
        <Card title="MVP 核心链路">
          <div className="timeline">
            {["上传文档", "解析并分块", "向量入库", "权限内检索", "SSE 流式回答"].map((item, index) => (
              <div className="timeline-item" key={item}>
                <span>{index + 1}</span>
                <strong>{item}</strong>
                <small>{index < 3 ? "入库流程" : "问答流程"}</small>
              </div>
            ))}
          </div>
        </Card>
        <Card title="快速入口">
          <div className="quick-actions">
            <button onClick={() => setView("ingestion")}><UploadCloud size={18} />上传文档</button>
            <button onClick={() => setView("chat")}><MessageSquareText size={18} />开始问答</button>
            <button onClick={() => setView("workflow")}><GitBranch size={18} />查看流程</button>
            <button onClick={() => setView("history")}><History size={18} />查看审计</button>
          </div>
        </Card>
      </div>
    </section>
  );
}

function WorkflowPage() {
  const flows: { title: string; summary: string; steps: FlowStep[] }[] = [
    {
      title: "文档入库流程",
      summary: "从用户上传或导入公开飞书链接开始，到文档解析、分块、向量入库和状态回写结束。",
      steps: [
        { title: "选择知识库", desc: "用户在所属部门权限范围内选择单个知识库。", kind: "start" },
        { title: "上传或导入", desc: "上传 Word、Excel、PDF、扫描 PDF，或提交公开飞书链接。" },
        { title: "格式校验", desc: "校验文件类型、大小、链接可访问性和用户权限。", kind: "decision" },
        { title: "保存原文", desc: "保存原始文件或链接正文，创建 documents 记录。" },
        { title: "解析分块", desc: "提取文本，按长度和语义窗口生成 chunk。" },
        { title: "向量入库", desc: "写入 document_chunks，带 department_id 和 knowledge_base_id。", kind: "done" },
      ],
    },
    {
      title: "RAG 问答流程",
      summary: "用户提问后，系统先做权限过滤，再召回片段、组装 prompt，并通过 SSE 流式返回答案。",
      steps: [
        { title: "输入问题", desc: "用户选择单个知识库并提交问题。", kind: "start" },
        { title: "鉴权过滤", desc: "后端读取当前用户角色和部门，SQL 层限制检索范围。", kind: "decision" },
        { title: "向量召回", desc: "在有权限的 chunk 内召回 top_k 相关片段。" },
        { title: "Prompt 组装", desc: "拼接问题、召回片段、引用规则和敏感数据约束。" },
        { title: "模型生成", desc: "调用 DeepSeek 兼容接口，按 SSE 返回增量内容。" },
        { title: "展示引用", desc: "答案完成后展示文档名称和原文片段。", kind: "done" },
      ],
    },
    {
      title: "权限与审计流程",
      summary: "所有业务动作都围绕用户角色、部门强隔离和审计日志展开。",
      steps: [
        { title: "用户登录", desc: "账号密码登录，后端签发 JWT。", kind: "start" },
        { title: "识别角色", desc: "区分超级管理员、部门管理员、普通用户。" },
        { title: "部门强隔离", desc: "知识库、文档、chunk、会话均按部门过滤。", kind: "decision" },
        { title: "执行业务", desc: "上传、删除、问答、管理用户等操作。" },
        { title: "写入审计", desc: "记录用户、时间、动作、token 消耗和召回文档。" },
        { title: "反馈回看", desc: "管理员按权限查看日志和人工反馈。", kind: "done" },
      ],
    },
    {
      title: "异常处理流程",
      summary: "把解析失败、无权限、无召回结果、模型错误等情况显式反馈给用户。",
      steps: [
        { title: "触发任务", desc: "上传文档、导入链接或发起问答。", kind: "start" },
        { title: "检测异常", desc: "格式错误、权限不足、解析失败、召回为空或模型超时。", kind: "risk" },
        { title: "状态回写", desc: "文档状态改为 failed，问答返回可理解的错误说明。" },
        { title: "用户处理", desc: "重新上传、调整问题、联系管理员或查看日志。" },
        { title: "审计记录", desc: "保留错误码、错误信息和关联资源。", kind: "done" },
      ],
    },
  ];

  return (
    <section className="content-stack">
      <div className="workflow-header">
        <div>
          <h3>核心业务流程图</h3>
          <p>基于 PRD 和 AGENTS.md，将前端展示、文档入库、RAG 检索、权限过滤和审计闭环拆成可读流程。</p>
        </div>
        <span className="pill"><GitBranch size={16} />MVP 流程视图</span>
      </div>
      <div className="workflow-grid">
        {flows.map((flow) => (
          <FlowDiagram key={flow.title} {...flow} />
        ))}
      </div>
    </section>
  );
}

function FlowDiagram({ title, summary, steps }: { title: string; summary: string; steps: FlowStep[] }) {
  return (
    <section className="flow-card">
      <header>
        <h3>{title}</h3>
        <p>{summary}</p>
      </header>
      <div className="flow-diagram" aria-label={title}>
        {steps.map((step, index) => (
          <React.Fragment key={step.title}>
            <article className={`flow-node ${step.kind ?? "process"}`}>
              <span>{index + 1}</span>
              <strong>{step.title}</strong>
              <p>{step.desc}</p>
            </article>
            {index < steps.length - 1 && <div className="flow-arrow" aria-hidden="true"></div>}
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

function KnowledgePage({
  authToken,
  setView,
  setSelectedKb,
  kbs,
  setKbs,
  documentRows,
  refreshDocuments,
  setNotice,
  authenticatedFetch,
}: {
  authToken: string;
  setView: (view: View) => void;
  setSelectedKb: (kb: KnowledgeBase) => void;
  kbs: KnowledgeBase[];
  setKbs: (kbs: KnowledgeBase[]) => void;
  documentRows: UploadRow[];
  refreshDocuments: () => Promise<void>;
  setNotice: (notice: string) => void;
  authenticatedFetch: AuthenticatedFetch;
}) {
  const fileSectionRef = useRef<HTMLDivElement>(null);
  const [activeKbId, setActiveKbId] = useState(kbs[0]?.id ?? "");
  const [selectedDocument, setSelectedDocument] = useState<DocumentDetail | null>(null);
  const activeDocs = documentRows.filter((doc) => doc.kbId === activeKbId && doc.status === "解析完成");

  useEffect(() => {
    if (!activeKbId && kbs[0]?.id) setActiveKbId(kbs[0].id);
  }, [activeKbId, kbs]);

  async function openDocument(doc: UploadRow) {
    if (!doc.id || !authToken) return;
    try {
      const response = await authenticatedFetch(`${API_BASE}/api/documents/${doc.id}`);
      if (!response.ok) throw new Error(await response.text());
      setSelectedDocument(await response.json());
    } catch {
      setNotice("打开文件详情失败，请确认后端服务和文档权限。");
    }
  }

  async function viewKbFiles(kb: KnowledgeBase) {
    setSelectedKb(kb);
    setActiveKbId(kb.id);
    setNotice(`正在查看 ${kb.name} 的入库文件。`);
    await refreshDocuments();
    window.setTimeout(() => fileSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function createKnowledgeBase() {
    if (!authToken) {
      setNotice("请先连接后端登录态，再创建知识库。");
      return;
    }
    const name = `新知识库 ${kbs.length + 1}`;
    try {
      const response = await authenticatedFetch(`${API_BASE}/api/kbs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, description: "前端工作台创建的知识库。" }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const kb = mapKnowledgeBase(await response.json());
      setKbs([kb, ...kbs]);
      setSelectedKb(kb);
      setNotice(`已创建知识库：${kb.name}`);
    } catch {
      setNotice("创建知识库失败，请确认当前账号具备管理员权限。");
    }
  }

  return (
    <section className="content-stack">
      <div className="section-toolbar">
        <div className="search-box"><Search size={18} /><input placeholder="搜索知识库名称、部门或文档" /></div>
        <div className="toolbar-actions">
          <button className="secondary-btn" onClick={refreshDocuments}>刷新文件</button>
          <button className="primary-btn small" onClick={createKnowledgeBase}>新建知识库</button>
        </div>
      </div>
      <div className="kb-grid">
        {kbs.map((kb) => (
          <article className={`kb-card ${activeKbId === kb.id ? "active" : ""}`} key={kb.id}>
            <div>
              <span className="status-dot"></span>
              <strong>{kb.name}</strong>
            </div>
            <p>{kb.dept} · 文档 {kb.docs} 个 · Chunk {kb.chunks} 个</p>
            <footer>
              <span>{kb.status}</span>
              <small>更新：{kb.updated}</small>
            </footer>
            <div className="card-actions">
              <button onClick={() => { setSelectedKb(kb); setView("chat"); }}>进入问答</button>
              <button onClick={() => { setSelectedKb(kb); setView("ingestion"); }}>入库文档</button>
              <button onClick={() => viewKbFiles(kb)}>查看入库文件</button>
            </div>
          </article>
        ))}
      </div>
      <div ref={fileSectionRef} className="kb-file-section">
      <Card title="知识库文件" className="kb-file-panel">
        {activeDocs.length === 0 ? (
          <div className="empty-table-state">
            <FileText size={26} />
            <strong>当前知识库暂无已解析文档</strong>
          </div>
        ) : (
          <div className="table-wrap scroll-table">
            <table>
              <thead><tr>{["文件名", "类型", "状态", "Chunk", "来源", "时间", "操作"].map((header) => <th key={header}>{header}</th>)}</tr></thead>
              <tbody>
                {activeDocs.map((doc) => (
                  <tr key={doc.id ?? doc.name}>
                    <td>{doc.name}</td>
                    <td>{doc.type}</td>
                    <td>{doc.status}</td>
                    <td>{doc.chunks}</td>
                    <td>{doc.source}</td>
                    <td>{doc.time}</td>
                    <td><button className="table-action" disabled={!doc.id} onClick={() => openDocument(doc)}>查看</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      </div>
      {selectedDocument && <DocumentDetailModal document={selectedDocument} onClose={() => setSelectedDocument(null)} />}
    </section>
  );
}

function IngestionPage({
  authToken,
  selectedKb,
  availableKbs,
  documentRows,
  setDocumentRows,
  refreshDocuments,
  authenticatedFetch,
}: {
  authToken: string;
  selectedKb: KnowledgeBase;
  availableKbs: KnowledgeBase[];
  documentRows: UploadRow[];
  setDocumentRows: React.Dispatch<React.SetStateAction<UploadRow[]>>;
  refreshDocuments: () => Promise<void>;
  authenticatedFetch: AuthenticatedFetch;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"file" | "link">("file");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadHint, setUploadHint] = useState("选择上传文件后，会先显示在下方解析状态列表中。");
  const [targetKbId, setTargetKbId] = useState(selectedKb.id);
  const [linkUrl, setLinkUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const selectedTargetKb = availableKbs.find((kb) => kb.id === targetKbId) ?? selectedKb;
  const canUpload = Boolean(authToken && targetKbId && ((mode === "file" && selectedFiles.length > 0) || (mode === "link" && linkUrl.trim())));

  useEffect(() => {
    setTargetKbId(selectedKb.id);
  }, [selectedKb.id]);

  function detectDisplayType(fileName: string) {
    const suffix = fileName.split(".").pop()?.toLowerCase();
    if (suffix === "pdf") return "PDF";
    if (suffix === "docx") return "Word";
    if (suffix === "xlsx" || suffix === "xlsm") return "Excel";
    return "待校验";
  }

  function handleFiles(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);
    if (!selectedFiles.length) return;
    setSelectedFiles(selectedFiles);
    setUploadHint(`已选择 ${selectedFiles.length} 个文件，请选择目标知识库后点击上传。`);
  }

  function makeTime() {
    const now = new Date();
    return `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }

  async function handleUpload() {
    if (!authToken) {
      setUploadHint("当前未连接后端登录态，请先启动后端并使用 Admin/7777 登录。");
      return;
    }
    if (!canUpload) {
      setUploadHint("请先选择文件或粘贴公开链接，并选择目标知识库。");
      return;
    }
    setIsUploading(true);
    setUploadHint(`正在上传到 ${selectedTargetKb.name}。`);
    try {
      if (mode === "file") {
        for (const file of selectedFiles) {
          const formData = new FormData();
          formData.append("file", file);
          const response = await authenticatedFetch(`${API_BASE}/api/upload/file?knowledge_base_id=${encodeURIComponent(targetKbId)}`, {
            method: "POST",
            body: formData,
          });
          if (!response.ok) throw new Error(await response.text());
          const document = await response.json();
          setDocumentRows((current) => [{
            id: document.id,
            kbId: document.knowledge_base_id,
            name: document.file_name,
            type: detectDisplayType(document.file_name),
            source: selectedTargetKb.name,
            status: "待解析",
            chunks: document.chunk_count ?? 0,
            owner: "当前用户",
            time: makeTime(),
          }, ...current]);
        }
        setSelectedFiles([]);
      } else {
        const response = await authenticatedFetch(`${API_BASE}/api/upload/link`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ knowledge_base_id: targetKbId, url: linkUrl.trim() }),
        });
        if (!response.ok) throw new Error(await response.text());
        const document = await response.json();
        setDocumentRows((current) => [{
          id: document.id,
          kbId: document.knowledge_base_id,
          name: document.file_name ?? "公开链接",
          type: "Link",
          source: selectedTargetKb.name,
          status: "待解析",
          chunks: document.chunk_count ?? 0,
          owner: "当前用户",
          time: makeTime(),
        }, ...current]);
        setLinkUrl("");
      }
      setUploadHint("上传完成。请在下方点击解析，系统会执行文本解析、分块和向量入库。");
      await refreshDocuments();
    } catch {
      setUploadHint("上传失败，请确认后端已启动、文件类型/链接有效且当前账号有知识库权限。");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleParse(row: UploadRow) {
    if (!row.id) return;
    setDocumentRows((current) => current.map((doc) => doc.id === row.id ? { ...doc, status: "解析中" } : doc));
    try {
      const response = await authenticatedFetch(`${API_BASE}/api/documents/${row.id}/parse`, { method: "POST" });
      if (!response.ok) throw new Error(await response.text());
      const document = await response.json();
      setDocumentRows((current) => current.map((doc) => doc.id === row.id ? { ...doc, status: document.status === "completed" ? "解析完成" : document.status, chunks: document.chunk_count ?? 0 } : doc));
      await refreshDocuments();
      setUploadHint("解析完成，Chunk 数已从后端回写。");
    } catch {
      setDocumentRows((current) => current.map((doc) => doc.id === row.id ? { ...doc, status: "解析失败" } : doc));
      setUploadHint("解析失败，请检查是否为扫描 PDF、链接不可访问或模型未完成初始化。");
    }
  }

  return (
    <section className="content-stack">
      <Card title="文档入库">
        <div className="ingestion-panel">
          <div className="mode-switch">
            <button className={mode === "file" ? "active" : ""} onClick={() => setMode("file")}>上传文件</button>
            <button className={mode === "link" ? "active" : ""} onClick={() => setMode("link")}>粘贴链接</button>
          </div>
          <label>目标知识库</label>
          <select value={targetKbId} onChange={(event) => setTargetKbId(event.target.value)}>
            {availableKbs.map((kb) => <option key={kb.id} value={kb.id}>{kb.name}</option>)}
          </select>
          {mode === "file" ? (
          <div className="dropzone compact">
            <UploadCloud size={38} />
            <strong>拖拽 Word / Excel / 文本型 PDF 到此处</strong>
            <span>单文件不超过 10MB，扫描件暂不支持，请上传文本型 PDF。</span>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              multiple
              accept=".pdf,.docx,.xlsx,.xlsm"
              onChange={(event) => handleFiles(event.target.files)}
            />
            <button className="primary-btn small" onClick={() => fileInputRef.current?.click()}>选择上传文件</button>
          </div>
          ) : (
          <div className="link-import">
            <label>公开链接</label>
            <div className="input-action">
              <input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="粘贴公开可访问的飞书链接" />
            </div>
          </div>
          )}
          <div className="ingestion-actions">
            <button className="primary-btn small" disabled={!canUpload || isUploading} onClick={handleUpload}>上传</button>
            <small>{uploadHint}</small>
          </div>
        </div>
      </Card>
      <Card title="文档解析状态">
        {documentRows.length === 0 ? (
          <div className="empty-table-state">
            <UploadCloud size={26} />
            <strong>选择上传文件</strong>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr>{["文件名", "类型", "知识库", "状态", "Chunk", "操作"].map((header) => <th key={header}>{header}</th>)}</tr></thead>
              <tbody>
                {documentRows.map((doc) => (
                  <tr key={doc.id ?? doc.name}>
                    <td>{doc.name}</td>
                    <td>{doc.type}</td>
                    <td>{doc.source}</td>
                    <td>{doc.status}</td>
                    <td>{doc.chunks}</td>
                    <td><button className="table-action" disabled={!doc.id || doc.status === "解析中"} onClick={() => handleParse(doc)}>解析</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}

function ChatPage({
  selectedKb,
  setSelectedKb,
  availableKbs,
  question,
  setQuestion,
  messages,
  setMessages,
  citations,
  setCitations,
  documentRows,
  authToken,
  activeSessionId,
  setActiveSessionId,
  chatSessions,
  refreshSessions,
  onUnauthorized,
  authenticatedFetch,
}: {
  selectedKb: typeof knowledgeBases[number];
  setSelectedKb: (kb: KnowledgeBase) => void;
  availableKbs: KnowledgeBase[];
  question: string;
  setQuestion: (value: string) => void;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  citations: CitationRow[];
  setCitations: (citations: CitationRow[]) => void;
  documentRows: UploadRow[];
  authToken: string;
  activeSessionId: string | null;
  setActiveSessionId: (sessionId: string | null) => void;
  chatSessions: ChatSessionSummary[];
  refreshSessions: () => Promise<void>;
  onUnauthorized: () => void;
  authenticatedFetch: AuthenticatedFetch;
}) {
  const [selectedDocument, setSelectedDocument] = useState<DocumentDetail | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function openCitation(citation: CitationRow) {
    if (!citation.document_id || !authToken) return;
    try {
      const response = await authenticatedFetch(`${API_BASE}/api/documents/${citation.document_id}`);
      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      if (!response.ok) throw new Error(await response.text());
      setSelectedDocument(await response.json());
    } catch {
      setMessages((current) => [...current, { role: "assistant", content: "文件详情打开失败，请确认后端服务和文档权限。" }]);
    }
  }

  async function loadSession(sessionId: string) {
    try {
      const response = await authenticatedFetch(`${API_BASE}/api/sessions/${sessionId}`);
      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      if (!response.ok) throw new Error(await response.text());
      const session = await response.json();
      const kb = availableKbs.find((item) => item.id === session.knowledge_base_id);
      if (kb) setSelectedKb(kb);
      setActiveSessionId(session.id);
      setMessages(session.messages.map((message: ChatMessage) => ({ role: message.role, content: message.content })));
      const lastAssistant = [...session.messages].reverse().find((message: { role: string; retrieved_chunks?: CitationRow[] }) => message.role === "assistant" && message.retrieved_chunks);
      setCitations(lastAssistant?.retrieved_chunks ?? []);
    } catch {
      setMessages((current) => [...current, { role: "assistant", content: "会话加载失败，请确认后端服务和当前账号权限。" }]);
    }
  }

  async function ask() {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) return;
    if (!authToken) {
      setMessages((current) => [...current, { role: "assistant", content: "当前未连接后端登录态，请重新登录后再提问。" }]);
      return;
    }
    setMessages((current) => [...current, { role: "user", content: trimmedQuestion }, { role: "assistant", content: "正在检索当前知识库..." }]);
    setCitations([]);
    setQuestion("");
    try {
      const response = await authenticatedFetch(`${API_BASE}/api/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ knowledge_base_id: selectedKb.id, question: trimmedQuestion, session_id: activeSessionId }),
      });
      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      if (!response.ok || !response.body) throw new Error(await response.text());
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      const handleBlock = (block: string) => {
        const normalizedBlock = block.replace(/\r\n/g, "\n");
        const eventType = normalizedBlock.match(/^event:\s*(.+)$/m)?.[1]?.trim();
        const dataLines = normalizedBlock.split("\n").filter((line) => line.startsWith("data:"));
        const data = dataLines.map((line) => line.replace(/^data:\s?/, "")).join("\n");
        if (!data) return;
        if (eventType === "metadata" || eventType === "done") {
          const parsed = JSON.parse(data);
          if (parsed.session_id) setActiveSessionId(parsed.session_id);
          if (parsed.citations) setCitations(parsed.citations);
          if (eventType === "done") refreshSessions();
        }
        if (eventType === "delta") {
          answer += data;
          setMessages((current) => current.map((msg, index) => index === current.length - 1 ? { ...msg, content: answer } : msg));
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          if (buffer.trim()) handleBlock(buffer);
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          handleBlock(block);
        }
      }
    } catch {
      setMessages((current) => current.map((msg, index) => index === current.length - 1 ? { ...msg, content: "问答失败，请确认后端服务、DeepSeek 配置和当前知识库解析状态。" } : msg));
    }
  }

  return (
    <section className="chat-layout">
      <aside className="chat-side">
        <label>当前知识库</label>
        <select value={selectedKb.id} onChange={(event) => setSelectedKb(availableKbs.find((kb) => kb.id === event.target.value) ?? availableKbs[0])}>
          {availableKbs.map((kb) => <option key={kb.id} value={kb.id}>{kb.name}</option>)}
        </select>
        <h3>历史会话</h3>
        {chatSessions.length === 0 ? (
          <div className="empty-mini">暂无历史会话</div>
        ) : chatSessions.map((session) => (
          <button
            className={`session-item ${activeSessionId === session.id ? "active" : ""}`}
            key={session.id}
            onClick={() => loadSession(session.id)}
          >
            {session.title}
          </button>
        ))}
      </aside>
      <Card title="对话窗口" className="chat-window">
        <div className="messages">
          {messages.length === 0 ? (
            <div className="empty-chat">
              <MessageSquareText size={30} />
              <strong>先选择知识库，再输入问题</strong>
              <span>未提问前不会展示引用来源；发送问题后才会根据召回结果显示相关文档。</span>
            </div>
        ) : (
            <>
              {messages.map((msg, index) => <div className={`message ${msg.role}`} key={`${msg.role}-${index}`}>{msg.content}</div>)}
              <div ref={messagesEndRef} />
            </>
        )}
        </div>
        <div className="composer">
          <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="继续追问企业流程问题..." onKeyDown={(event) => event.key === "Enter" && ask()} />
          <button onClick={ask}><SendHorizontal size={18} />发送</button>
        </div>
      </Card>
      <aside className="citation-panel">
        <h3>引用来源</h3>
        {messages.length === 0 ? (
          <div className="empty-citation">
            <FileText size={22} />
            <strong>暂无引用</strong>
            <p>提交问题并完成 RAG 召回后，这里才展示命中的文档名称和原文片段。</p>
          </div>
        ) : citations.length > 0 ? (
          citations.map((citation) => (
            <button className="citation-card" key={citation.chunk_id ?? `${citation.document_name}-${citation.content_preview}`} onClick={() => openCitation(citation)}>
              <FileText size={18} />
              <strong>{citation.document_name}</strong>
              <p>{citation.content_preview}</p>
            </button>
          ))
        ) : (
          <div className="empty-citation">
            <FileText size={22} />
            <strong>未命中相关片段</strong>
            <p>本次问题没有检索到可引用的 chunk。请确认文档已解析完成，或换一种更贴近原文的问法。</p>
          </div>
        )}
      </aside>
      {selectedDocument && <DocumentDetailModal document={selectedDocument} onClose={() => setSelectedDocument(null)} />}
    </section>
  );
}

function HistoryPage({ sessions, messages, setNotice }: { sessions: ChatSessionSummary[]; messages: ChatMessage[]; setNotice: (notice: string) => void }) {
  return (
    <section className="content-stack">
      <div className="section-toolbar">
        <div className="search-box"><Search size={18} /><input placeholder="按问题、用户、知识库搜索" /></div>
        <button className="secondary-btn" onClick={() => setNotice("当前 MVP 仅展示登录用户所属部门数据，后续会接入多部门筛选。")}><ChevronDown size={16} />产品运营部</button>
      </div>
      <Card title="问答历史与审计">
        <DataTable
          headers={["会话标题", "知识库ID", "更新时间", "当前载入消息数"]}
          rows={sessions.length > 0
            ? sessions.map((session) => [session.title, session.knowledge_base_id, formatTime(session.updated_at), String(messages.length)])
            : [["暂无历史会话", "-", "-", "0"]]}
        />
      </Card>
    </section>
  );
}

function AdminPage({ role }: { role: Role }) {
  return (
    <section className="content-stack">
      <div className="stats-row">
        <Stat icon={UsersRound} label="用户数" value="12" />
        <Stat icon={Building2} label="部门数" value="3" />
        <Stat icon={Archive} label="知识库" value="5" />
        <Stat icon={Clock3} label="今日 Token" value="36k" />
      </div>
      <div className="two-col">
        <Card title="用户管理">
          <DataTable headers={["用户名", "角色", "部门", "状态"]} rows={users.map((user) => [user.name, user.role, user.dept, user.status])} />
        </Card>
        <Card title="权限边界">
          <div className="policy-list">
            <p><ShieldCheck size={18} />当前角色：{role}</p>
            <p><CheckCircle2 size={18} />所有业务查询必须携带 department_id。</p>
            <p><CheckCircle2 size={18} />文档删除时级联删除 chunk 和向量。</p>
            <p><CheckCircle2 size={18} />审计日志记录用户、时间、token 和召回文档。</p>
          </div>
        </Card>
      </div>
    </section>
  );
}

function DocumentDetailModal({ document, onClose }: { document: DocumentDetail; onClose: () => void }) {
  const statusMap: Record<string, string> = {
    pending: "待解析",
    processing: "解析中",
    completed: "解析完成",
    failed: "解析失败",
  };
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="document-modal">
        <header>
          <div>
            <span>文件详情</span>
            <h3>{document.file_name}</h3>
          </div>
          <button className="icon-btn" onClick={onClose}>×</button>
        </header>
        <div className="document-meta">
          <span>{document.file_type}</span>
          <span>{statusMap[document.status] ?? document.status}</span>
          <span>Chunk {document.chunk_count}</span>
        </div>
        {document.error_message && <p className="form-error compact">{document.error_message}</p>}
        {document.chunks.length === 0 ? (
          <div className="empty-table-state">
            <FileText size={24} />
            <strong>暂无可预览 Chunk</strong>
          </div>
        ) : (
          <div className="chunk-preview-list">
            {document.chunks.map((chunk) => (
              <article key={chunk.id}>
                <strong>Chunk {chunk.chunk_index + 1}</strong>
                <p>{chunk.content}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <article className="stat-card">
      <Icon size={22} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>{row.map((cell, i) => <td key={`${cell}-${i}`}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
