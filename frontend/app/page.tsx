"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Archive,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  GitBranch,
  History,
  Layers3,
  MessageSquareText,
  Search,
  ShieldCheck,
  UploadCloud,
  UsersRound,
} from "lucide-react";
import { AuthGate } from "@/features/auth/AuthGate";
import { ChangePasswordPage } from "@/features/auth/ChangePasswordPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { SessionsPanel } from "@/features/auth/SessionsPanel";
import { useAuth } from "@/features/auth/hooks";
import { apiFetch } from "@/lib/apiClient";
import { ApiError } from "@/types/common";
import type { RegisterRequest, UserInfo } from "@/features/auth/types";
import { InvitePage } from "@/features/admin/InvitePage";
import { KnowledgeBaseConfigPanel } from "@/features/admin/KnowledgeBaseConfigPanel";
import { OrganizationPanel } from "@/features/admin/OrganizationPanel";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { Composer } from "@/features/chat/Composer";
import { MessageList } from "@/features/chat/MessageList";
import type { ChatMessage } from "@/features/chat/types";
import { DocumentDetailModal } from "@/features/documents/DocumentDetailModal";
import { IngestionPage } from "@/features/documents/IngestionPage";
import { KnowledgePage } from "@/features/documents/KnowledgePage";
import type { BackendDocument, BackendKnowledgeBase, DocumentDetail, KnowledgeBase, UploadRow } from "@/features/documents/types";

type View = "dashboard" | "knowledge" | "ingestion" | "chat" | "workflow" | "history" | "admin" | "account";
type Role = "超级管理员" | "部门管理员" | "普通用户";
type CitationRow = {
  document_id?: string | null;
  document_name: string;
  content_preview: string;
  chunk_id?: string;
  score?: number | null;
};

type FlowStep = {
  title: string;
  desc: string;
  kind?: "start" | "process" | "decision" | "risk" | "done";
};
type ChatSessionSummary = {
  id: string;
  knowledge_base_id: string;
  title: string;
  updated_at: string;
};

const knowledgeBases: KnowledgeBase[] = [
  { id: "kb-1", name: "产品制度知识库", dept: "产品运营部", docs: 18, chunks: 326, status: "已启用", updated: "2026-09-07 15:20" },
  { id: "kb-2", name: "项目交付流程库", dept: "产品运营部", docs: 12, chunks: 214, status: "解析完成", updated: "2026-09-06 18:42" },
  { id: "kb-3", name: "售后 FAQ 知识库", dept: "客户成功部", docs: 9, chunks: 143, status: "部门隔离", updated: "2026-09-05 11:05" },
];

type AuthenticatedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type AuthView = "login" | "register" | "change-password";

type AdminStats = {
  users: number;
  departments: number;
  knowledge_bases: number;
  today_tokens: number;
};

type AdminUserRow = {
  id: string;
  username: string;
  role: string;
  org_id: string;
  department_id: string;
  department_name?: string | null;
  is_active: boolean;
  must_change_password: boolean;
};

const NETWORK_ERROR_MESSAGE = "网络异常，无法连接服务器，请检查连接后重试。";

function isNetworkError(error: unknown) {
  return error instanceof ApiError && (error.status === 0 || error.code === "NETWORK_ERROR");
}

function isOfflineNow() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function toFriendlyError(error: unknown, fallback: string) {
  if (isNetworkError(error)) return NETWORK_ERROR_MESSAGE;
  if (error instanceof ApiError && error.message) return error.message;
  return fallback;
}

type AdminDepartmentRow = {
  id: string;
  name: string;
  org_id: string;
  description?: string | null;
};

function mapBackendRole(role: string): Role {
  if (role === "super_admin") return "超级管理员";
  if (role === "dept_admin") return "部门管理员";
  return "普通用户";
}

function mapKnowledgeBase(kb: BackendKnowledgeBase): KnowledgeBase {
  return {
    id: kb.id,
    name: kb.name,
    scope: kb.scope ?? "department",
    targetId: kb.target_id ?? kb.department_id,
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

function mapDocument(document: BackendDocument, kbs: KnowledgeBase[]): UploadRow {
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
    owner: document.uploader_name ?? document.uploaded_by ?? "未知用户",
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
  const auth = useAuth();
  const [authView, setAuthView] = useState<AuthView>("login");
  const [view, setView] = useState<View>("chat");
  const [role, setRole] = useState<Role>("部门管理员");
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null);
  const [availableKbs, setAvailableKbs] = useState<KnowledgeBase[]>([]);
  const [loginError, setLoginError] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [notice, setNotice] = useState("");
  const [documentRows, setDocumentRows] = useState<UploadRow[]>([]);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [citations, setCitations] = useState<CitationRow[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (auth.status !== "authenticated" || availableKbs.length > 0 || chatSessions.length > 0) return;
    void restoreLogin(auth.accessToken ?? "", auth.user);
  }, [auth.status, auth.accessToken, auth.user, availableKbs.length, chatSessions.length]);

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
      account: "账号安全",
    };
    return map[view];
  }, [view]);

  if (auth.status === "unauthenticated") {
    if (authView === "register") {
      return (
        <RegisterPage
          onAuthenticated={handleRegister}
          onBackToLogin={() => {
            setRegisterError("");
            setAuthView("login");
          }}
          registerError={registerError}
        />
      );
    }
    return (
      <LoginPage
        onAuthenticated={handleLogin}
        onGoRegister={() => {
          setLoginError("");
          setAuthView("register");
        }}
        role={role}
        setRole={setRole}
        loginError={loginError}
      />
    );
  }

  if (auth.status === "authenticated" && authView === "change-password") {
    return (
      <ChangePasswordPage
        onPasswordChanged={() => {
          setAuthView("login");
          setView("chat");
        }}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <AuthGate onUnauthenticated={() => setAuthView("login")} onMustChangePassword={() => setAuthView("change-password")}>
      <AppShell
        active={view}
        onNavigate={setView}
        title={title}
        role={role}
        orgName={auth.org?.name ?? "未识别组织"}
        departmentName={auth.department?.name ?? "未识别部门"}
        userName={auth.user?.full_name || auth.user?.username || "当前用户"}
        onLogout={handleLogout}
        notice={notice}
      >
        {view === "dashboard" && (
          <Dashboard
            setView={setView}
            kbs={availableKbs}
            documentRows={documentRows}
            chatSessions={chatSessions}
          />
        )}
        {view === "knowledge" && (
          <KnowledgePage
            setSelectedKb={setSelectedKb}
            onEnterChat={(kb) => {
              setSelectedKb(kb);
              setView("chat");
            }}
            onEnterIngestion={(kb) => {
              setSelectedKb(kb);
              setView("ingestion");
            }}
            kbs={availableKbs}
            documentRows={documentRows}
            refreshDocuments={refreshDocuments}
            setNotice={setNotice}
            canDeleteDocuments={role === "超级管理员" || role === "部门管理员"}
          />
        )}
        {view === "ingestion" && (
          <IngestionPage
            selectedKb={selectedKb}
            availableKbs={availableKbs}
            role={role}
            documentRows={documentRows}
            setDocumentRows={setDocumentRows}
            refreshDocuments={refreshDocuments}
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
        {view === "admin" && <AdminPage role={role} refreshDocuments={refreshDocuments} authenticatedFetch={authenticatedFetch} />}
        {view === "account" && <SessionsPanel />}
      </AppShell>
    </AuthGate>
  );

  async function handleLogin(username: string, password: string) {
    setLoginError("");
    try {
      const data = await auth.login(username, password);
      await restoreLogin(data.access_token, data.user);
    } catch (error) {
      setLoginError(toFriendlyError(error, "账号或密码错误，请确认后重试。"));
    }
  }

  async function handleRegister(payload: RegisterRequest) {
    setRegisterError("");
    try {
      const data = await auth.register(payload);
      await restoreLogin(data.access_token, data.user);
    } catch (error) {
      setRegisterError(toFriendlyError(error, "注册失败，请确认用户名未重复、密码不少于 8 位，且已选择有效组织或邀请码。"));
    }
  }

  async function restoreLogin(token: string, userInfo: UserInfo) {
    try {
      void token;
      setRole(mapBackendRole(userInfo.role));

      const [kbs, sessions] = await Promise.all([
        loadKnowledgeBases(),
        loadSessions().catch(() => []),
      ]);
      const { rows } = await loadDocuments(kbs, { tolerateFailures: true });
      setAvailableKbs(withKbStats(kbs, rows));
      setSelectedKb(kbs[0] ?? null);
      setDocumentRows(rows);
      setChatSessions(sessions);
      const cachedMessages = window.localStorage.getItem("active_chat_messages");
      if (cachedMessages) setMessages(JSON.parse(cachedMessages));
      setView("chat");
    } catch (error) {
      if (isNetworkError(error)) {
        setLoginError(NETWORK_ERROR_MESSAGE);
        return;
      }
      handleLogout();
      setLoginError("登录态已失效，请重新登录。");
    }
  }

  function handleUnauthorized() {
    handleLogout();
    setLoginError("登录态已失效，请重新登录后再继续问答。");
  }

  async function handleLogout() {
    await auth.logout().catch(() => {});
    window.localStorage.removeItem("active_chat_messages");
    setAuthView("login");
    setMessages([]);
    setCitations([]);
    setChatSessions([]);
    setActiveSessionId(null);
    setAvailableKbs([]);
    setSelectedKb(null);
  }

  async function loadKnowledgeBases() {
    const response = await authenticatedFetch("/api/kbs");
    const kbs: BackendKnowledgeBase[] = await response.json();
    return kbs.map(mapKnowledgeBase);
  }

  async function loadDocuments(kbs: KnowledgeBase[], options: { tolerateFailures?: boolean } = {}) {
    const requests = kbs.map(async (kb) => {
      const response = await authenticatedFetch(`/api/documents?knowledge_base_id=${encodeURIComponent(kb.id)}`);
      const documents = await response.json();
      return documents.map((document: Parameters<typeof mapDocument>[0]) => mapDocument(document, kbs));
    });

    if (!options.tolerateFailures) {
      const lists = await Promise.all(requests);
      return { rows: lists.flat(), failedCount: 0 };
    }

    const results = await Promise.allSettled(requests);
    const rows = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    const failedCount = results.filter((result) => result.status === "rejected").length;
    return { rows, failedCount };
  }

  async function loadSessions() {
    const response = await authenticatedFetch("/api/sessions");
    return response.json();
  }

  async function refreshSessions() {
    if (auth.status !== "authenticated") return;
    setChatSessions(await loadSessions());
  }

  async function refreshDocuments(nextKbs?: KnowledgeBase[]) {
    if (auth.status !== "authenticated") return;
    try {
      const kbs = nextKbs ?? await loadKnowledgeBases();
      const { rows, failedCount } = await loadDocuments(kbs, { tolerateFailures: true });
      setDocumentRows(rows);
      setAvailableKbs(withKbStats(kbs, rows));
      setSelectedKb((current) => {
        if (!current) return kbs[0] ?? null;
        return kbs.find((kb) => kb.id === current.id) ?? kbs[0] ?? null;
      });
      setNotice(failedCount > 0 ? `知识库已刷新，${failedCount} 个知识库的文件列表暂时加载失败。` : "知识库和文件列表已刷新。");
    } catch (error) {
      setNotice(toFriendlyError(error, "刷新知识库和文件失败，已保留当前页面数据。"));
    }
  }

  async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
    try {
      return await apiFetch(input, init);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleUnauthorized();
      }
      throw error;
    }
  }
}

function Dashboard({
  setView,
  kbs,
  documentRows,
  chatSessions,
}: {
  setView: (view: View) => void;
  kbs: KnowledgeBase[];
  documentRows: UploadRow[];
  chatSessions: ChatSessionSummary[];
}) {
  const todayKey = new Date().toDateString();
  const todaySessionCount = chatSessions.filter((session) => new Date(session.updated_at).toDateString() === todayKey).length;
  const totalChunks = documentRows.reduce((sum, row) => sum + row.chunks, 0);

  return (
    <section className="page-grid">
      <div className="stats-row">
        <Stat icon={BookOpen} label="知识库" value={String(kbs.length)} />
        <Stat icon={FileText} label="文档总数" value={String(documentRows.length)} />
        <Stat icon={Layers3} label="Chunk 数" value={String(totalChunks)} />
        <Stat icon={Activity} label="今日问答" value={String(todaySessionCount)} />
      </div>
      <div className="dashboard-flow-stack">
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
  activeSessionId,
  setActiveSessionId,
  chatSessions,
  refreshSessions,
  onUnauthorized,
  authenticatedFetch,
}: {
  selectedKb: KnowledgeBase | null;
  setSelectedKb: (kb: KnowledgeBase | null) => void;
  availableKbs: KnowledgeBase[];
  question: string;
  setQuestion: (value: string) => void;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  citations: CitationRow[];
  setCitations: (citations: CitationRow[]) => void;
  documentRows: UploadRow[];
  activeSessionId: string | null;
  setActiveSessionId: (sessionId: string | null) => void;
  chatSessions: ChatSessionSummary[];
  refreshSessions: () => Promise<void>;
  onUnauthorized: () => void;
  authenticatedFetch: AuthenticatedFetch;
}) {
  const [selectedDocument, setSelectedDocument] = useState<DocumentDetail | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);

  async function openCitation(citation: CitationRow) {
    if (!citation.document_id) return;
    if (isOfflineNow()) {
      setMessages((current) => [...current, { role: "assistant", content: NETWORK_ERROR_MESSAGE }]);
      return;
    }
    setIsRequesting(true);
    try {
      const response = await authenticatedFetch(`/api/documents/${citation.document_id}`);
      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      if (!response.ok) throw new Error(await response.text());
      setSelectedDocument(await response.json());
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", content: toFriendlyError(error, "文件详情打开失败，请确认后端服务和文档权限。") }]);
    } finally {
      setIsRequesting(false);
    }
  }

  async function loadSession(sessionId: string) {
    if (isRequesting) return;
    if (isOfflineNow()) {
      setMessages((current) => [...current, { role: "assistant", content: NETWORK_ERROR_MESSAGE }]);
      return;
    }
    setIsRequesting(true);
    try {
      const response = await authenticatedFetch(`/api/sessions/${sessionId}`);
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
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", content: toFriendlyError(error, "会话加载失败，请确认后端服务和当前账号权限。") }]);
    } finally {
      setIsRequesting(false);
    }
  }

  async function ask() {
    if (isRequesting) return;
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) return;
    if (isOfflineNow()) {
      setMessages((current) => [...current, { role: "assistant", content: NETWORK_ERROR_MESSAGE }]);
      return;
    }
    if (!selectedKb) {
      setMessages((current) => [...current, { role: "assistant", content: "当前账号暂无可用知识库，请先由管理员创建知识库或切换到有权限的组织。" }]);
      return;
    }
    setMessages((current) => [...current, { role: "user", content: trimmedQuestion }, { role: "assistant", content: "正在检索当前知识库..." }]);
    setCitations([]);
    setQuestion("");
    setIsRequesting(true);
    try {
      const response = await authenticatedFetch("/api/chat/stream", {
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
    } catch (error) {
      setMessages((current) => current.map((msg, index) => index === current.length - 1 ? { ...msg, content: toFriendlyError(error, "问答失败，请确认后端服务、DeepSeek 配置和当前知识库解析状态。") } : msg));
    } finally {
      setIsRequesting(false);
    }
  }

  return (
    <section className="chat-layout">
      <aside className="chat-side">
        <label>当前知识库</label>
        <select value={selectedKb?.id ?? ""} disabled={availableKbs.length === 0} onChange={(event) => setSelectedKb(availableKbs.find((kb) => kb.id === event.target.value) ?? null)}>
          {availableKbs.length === 0 && <option value="">暂无可用知识库</option>}
          {availableKbs.map((kb) => <option key={kb.id} value={kb.id}>{kb.name}</option>)}
        </select>
        <h3>历史会话</h3>
        {chatSessions.length === 0 ? (
          <div className="empty-mini">暂无历史会话</div>
        ) : chatSessions.map((session) => (
          <button
            className={`session-item ${activeSessionId === session.id ? "active" : ""}`}
            key={session.id}
            disabled={isRequesting}
            onClick={() => loadSession(session.id)}
          >
            {session.title}
          </button>
        ))}
      </aside>
      <Card title="对话窗口" className="chat-window">
        <MessageList messages={messages} />
        <Composer question={question} disabled={isRequesting} onQuestionChange={setQuestion} onSubmit={ask} />
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
            <button className="citation-card" disabled={isRequesting} key={citation.chunk_id ?? `${citation.document_name}-${citation.content_preview}`} onClick={() => openCitation(citation)}>
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

function AdminPage({
  role,
  refreshDocuments,
  authenticatedFetch,
}: {
  role: Role;
  refreshDocuments: () => Promise<void>;
  authenticatedFetch: AuthenticatedFetch;
}) {
  type AdminTab = "users" | "departments" | "knowledge";
  const [adminDataVersion, setAdminDataVersion] = useState(0);
  const [stats, setStats] = useState<AdminStats>({ users: 0, departments: 0, knowledge_bases: 0, today_tokens: 0 });
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);
  const [departments, setDepartments] = useState<AdminDepartmentRow[]>([]);
  const [adminNotice, setAdminNotice] = useState("");
  const [activeTab, setActiveTab] = useState<AdminTab>("users");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [editingUser, setEditingUser] = useState<AdminUserRow | null>(null);
  const [editRole, setEditRole] = useState("user");
  const [editDepartmentId, setEditDepartmentId] = useState("");
  const isSuperAdmin = role === "超级管理员";
  const filteredUsers = adminUsers.filter((user) => {
    const keyword = searchKeyword.trim().toLowerCase();
    const matchesKeyword = !keyword || user.username.toLowerCase().includes(keyword);
    const matchesDepartment = !departmentFilter || user.department_id === departmentFilter;
    const matchesRole = !roleFilter || user.role === roleFilter;
    return matchesKeyword && matchesDepartment && matchesRole;
  });

  useEffect(() => {
    void refreshAdminData();
  }, [adminDataVersion]);

  async function refreshAdminData() {
    try {
      const [statsResponse, usersResponse] = await Promise.all([
        authenticatedFetch("/api/admin/stats"),
        authenticatedFetch("/api/admin/users"),
      ]);
      const departmentsResponse = await authenticatedFetch("/api/departments");
      setStats(await statsResponse.json());
      setAdminUsers(await usersResponse.json());
      setDepartments(await departmentsResponse.json());
      setAdminNotice("");
    } catch (error) {
      setAdminNotice(toFriendlyError(error, "系统管理数据加载失败，请确认当前账号管理员权限。"));
    }
  }

  function openEditUser(user: AdminUserRow) {
    setEditingUser(user);
    setEditRole(user.role);
    setEditDepartmentId(user.department_id);
  }

  async function submitUserRole() {
    if (!editingUser) return;
    try {
      await authenticatedFetch(`/api/users/${editingUser.id}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: editRole, department_id: editDepartmentId }),
      });
      setEditingUser(null);
      setAdminDataVersion((version) => version + 1);
      setAdminNotice("用户角色已更新。");
    } catch (error) {
      setAdminNotice(toFriendlyError(error, "用户角色更新失败，请确认权限和部门选择。"));
    }
  }

  async function toggleUserStatus(user: AdminUserRow) {
    try {
      await authenticatedFetch(`/api/users/${user.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !user.is_active }),
      });
      setAdminDataVersion((version) => version + 1);
      setAdminNotice(user.is_active ? "用户已禁用。" : "用户已启用。");
    } catch (error) {
      setAdminNotice(toFriendlyError(error, "用户状态修改失败，不能修改当前账号或无权限账号。"));
    }
  }

  function resetUserFilters() {
    setSearchKeyword("");
    setDepartmentFilter("");
    setRoleFilter("");
    setActiveTab("users");
  }

  const permissionBoundary = (
    <Card title="权限边界">
      <div className="policy-list">
        <p><ShieldCheck size={18} />当前角色：{role}</p>
        {isSuperAdmin ? (
          <>
            <p><CheckCircle2 size={18} />管辖范围：全组织管理视角。</p>
            <p><CheckCircle2 size={18} />可创建组织、知识库，并任命部门管理员。</p>
          </>
        ) : (
          <>
            <p><CheckCircle2 size={18} />管辖范围：仅当前部门。</p>
            <p><CheckCircle2 size={18} />不能修改用户角色或跨部门管理数据。</p>
          </>
        )}
        <p><CheckCircle2 size={18} />禁用用户会使其后续无法登录，但保留历史数据。</p>
      </div>
    </Card>
  );

  return (
    <section className="content-stack">
      <div className="stats-row">
        <button className="stat-button" onClick={resetUserFilters}><Stat icon={UsersRound} label="用户数" value={String(stats.users)} /></button>
        <button className="stat-button" onClick={() => setActiveTab("departments")}><Stat icon={Building2} label="部门数" value={String(stats.departments)} /></button>
        <button className="stat-button" onClick={() => setActiveTab("knowledge")}><Stat icon={Archive} label="知识库" value={String(stats.knowledge_bases)} /></button>
        <Stat icon={Clock3} label="今日 Token" value={formatTokenCount(stats.today_tokens)} />
      </div>
      {adminNotice && <div className="notice-bar">{adminNotice}</div>}
      <div className="admin-tabs">
        <button className={activeTab === "users" ? "active" : ""} onClick={() => setActiveTab("users")}>用户管理</button>
        <button className={activeTab === "departments" ? "active" : ""} onClick={() => setActiveTab("departments")}>部门管理</button>
        <button className={activeTab === "knowledge" ? "active" : ""} onClick={() => setActiveTab("knowledge")}>知识库管理</button>
      </div>
      {activeTab === "knowledge" ? (
        <div className="two-col admin-management-layout">
          <KnowledgeBaseConfigPanel key={adminDataVersion} enabled={role !== "普通用户"} adminRole={role} onCreated={async () => {
            await refreshDocuments();
            setAdminDataVersion((version) => version + 1);
          }} />
          {permissionBoundary}
        </div>
      ) : (
      <div className="two-col admin-management-layout">
        <Card title={activeTab === "users" ? "用户管理" : activeTab === "departments" ? "部门管理" : "知识库管理"}>
          {activeTab === "users" && (
            <>
              <div className="admin-table-toolbar">
                <div className="search-box"><Search size={16} /><input value={searchKeyword} onChange={(event) => setSearchKeyword(event.target.value)} placeholder="按用户名搜索" /></div>
                {(departmentFilter || roleFilter || searchKeyword) && <button className="secondary-btn" onClick={resetUserFilters}>清除筛选</button>}
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>用户名</th><th>角色</th><th>部门</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr><td colSpan={5}>暂无用户</td></tr>
                    ) : filteredUsers.map((user) => (
                      <tr key={user.id}>
                        <td>{user.username}</td>
                        <td><button className="link-cell" onClick={() => setRoleFilter(roleFilter === user.role ? "" : user.role)}>{mapBackendRole(user.role)}</button></td>
                        <td><button className="link-cell" onClick={() => setDepartmentFilter(departmentFilter === user.department_id ? "" : user.department_id)}>{user.department_name || "-"}</button></td>
                        <td>{user.is_active ? (user.must_change_password ? "需改密" : "启用") : "停用"}</td>
                        <td>
                          <button className="table-action" disabled={!isSuperAdmin} onClick={() => openEditUser(user)}>编辑角色</button>
                          <button className="table-action" disabled={!isSuperAdmin} onClick={() => toggleUserStatus(user)}>{user.is_active ? "禁用" : "启用"}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {activeTab === "departments" && (
            <DataTable
              headers={["部门名称", "部门ID", "组织ID", "说明"]}
              rows={departments.length > 0
                ? departments.map((department) => [department.name, department.id, department.org_id, department.description || "-"])
                : [["暂无部门", "-", "-", "-"]]}
            />
          )}
        </Card>
        {permissionBoundary}
      </div>
      )}
      <OrganizationPanel enabled={isSuperAdmin} onChanged={() => setAdminDataVersion((version) => version + 1)} />
      <InvitePage enabled={isSuperAdmin} />
      {editingUser && (
        <Modal>
          <header>
            <div>
              <span>用户权限</span>
              <h3>编辑角色</h3>
            </div>
            <button className="icon-btn" onClick={() => setEditingUser(null)}>×</button>
          </header>
          <div className="admin-kb-form">
            <label><span>用户名</span><input value={editingUser.username} readOnly /></label>
            <label>
              <span>所属部门</span>
              <select value={editDepartmentId} onChange={(event) => setEditDepartmentId(event.target.value)}>
                {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
              </select>
            </label>
            <label>
              <span>系统角色</span>
              <select value={editRole} onChange={(event) => setEditRole(event.target.value)}>
                <option value="user">普通成员</option>
                <option value="dept_admin">部门管理员</option>
                <option value="super_admin">超级管理员</option>
              </select>
            </label>
            <button className="primary-btn" disabled={!editDepartmentId} onClick={submitUserRole}>保存修改</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function formatTokenCount(value: number) {
  if (value >= 1000) return `${Math.round(value / 100) / 10}k`;
  return String(value);
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
