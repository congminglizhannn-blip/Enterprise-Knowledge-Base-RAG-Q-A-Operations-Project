"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  BookOpen,
  FileText,
  GitBranch,
  History,
  Layers3,
  MessageSquareText,
  UploadCloud,
} from "lucide-react";
import { AuthGate } from "@/features/auth/AuthGate";
import { SessionsPanel } from "@/features/auth/SessionsPanel";
import { useAuth } from "@/features/auth/hooks";
import { apiFetch } from "@/lib/apiClient";
import { NETWORK_ERROR_MESSAGE, isNetworkError, toFriendlyError } from "@/lib/errors";
import { BUSINESS_VIEWS, ROUTED_VIEWS, type BusinessView } from "@/lib/routing";
import { ApiError, type AuthenticatedFetch } from "@/types/common";
import type { UserInfo } from "@/features/auth/types";
import { AdminPage } from "@/features/admin/AdminPage";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { ChatPage } from "@/features/chat/ChatPage";
import { HistoryPage } from "@/features/chat/HistoryPage";
import type { ChatMessage, ChatSessionSummary, CitationRow } from "@/features/chat/types";
import { IngestionPage } from "@/features/documents/IngestionPage";
import { KnowledgePage } from "@/features/documents/KnowledgePage";
import type { BackendDocument, BackendKnowledgeBase, KnowledgeBase, UploadRow } from "@/features/documents/types";
import type { Role } from "@/features/auth/types";
import { mapBackendRole } from "@/features/auth/utils";
import { WorkflowPage } from "@/features/rag/WorkflowPage";

type View = "dashboard" | "knowledge" | "ingestion" | "chat" | "workflow" | "history" | "admin" | "account";

const knowledgeBases: KnowledgeBase[] = [
  { id: "kb-1", name: "产品制度知识库", dept: "产品运营部", docs: 18, chunks: 326, status: "已启用", updated: "2026-09-07 15:20" },
  { id: "kb-2", name: "项目交付流程库", dept: "产品运营部", docs: 12, chunks: 214, status: "解析完成", updated: "2026-09-06 18:42" },
  { id: "kb-3", name: "售后 FAQ 知识库", dept: "客户成功部", docs: 9, chunks: 143, status: "部门隔离", updated: "2026-09-05 11:05" },
];

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
  return (
    <Suspense fallback={null}>
      <AppContent />
    </Suspense>
  );
}

function AppContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlView = searchParams.get("view");
  const auth = useAuth();
  const [view, setView] = useState<View>("chat");
  const [role, setRole] = useState<Role>("部门管理员");
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null);
  const [availableKbs, setAvailableKbs] = useState<KnowledgeBase[]>([]);
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
    if (!urlView) return;
    const candidate = urlView as BusinessView;
    if (ROUTED_VIEWS.has(candidate)) {
      router.replace(`/${urlView}`);
      return;
    }
    if (BUSINESS_VIEWS.includes(candidate)) {
      setView(candidate as View);
    }
  }, [urlView, router]);

  useEffect(() => {
    if (auth.status === "unauthenticated") {
      router.replace("/login");
    }
  }, [auth.status, router]);

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

  if (auth.status === "loading" || auth.status === "unauthenticated") {
    return null;
  }

  return (
    <AuthGate>
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
        setNotice(NETWORK_ERROR_MESSAGE);
        return;
      }
      handleLogout();
      setNotice("登录态已失效，请重新登录。");
    }
  }

  function handleUnauthorized() {
    handleLogout();
    setNotice("登录态已失效，请重新登录后再继续问答。");
  }

  async function handleLogout() {
    await auth.logout().catch(() => {});
    window.localStorage.removeItem("active_chat_messages");
    setMessages([]);
    setCitations([]);
    setChatSessions([]);
    setActiveSessionId(null);
    setAvailableKbs([]);
    setSelectedKb(null);
    router.replace("/login");
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
