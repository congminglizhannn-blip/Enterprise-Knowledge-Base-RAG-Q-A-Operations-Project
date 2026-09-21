"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGate } from "@/features/auth/AuthGate";
import { useAuth } from "@/features/auth/hooks";
import type { Role } from "@/features/auth/types";
import { mapBackendRole } from "@/features/auth/utils";
import type { ChatSessionSummary } from "@/features/chat/types";
import { Dashboard } from "@/features/dashboard/Dashboard";
import type {
  BackendDocument,
  BackendKnowledgeBase,
  KnowledgeBase,
  UploadRow,
} from "@/features/documents/types";
import { apiFetch } from "@/lib/apiClient";
import { ROUTED_VIEWS, type BusinessView } from "@/lib/routing";
import { ApiError } from "@/types/common";

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

function DashboardPageContent() {
  const router = useRouter();
  const auth = useAuth();
  const role: Role = auth.user ? mapBackendRole(auth.user.role) : "普通用户";

  const [availableKbs, setAvailableKbs] = useState<KnowledgeBase[]>([]);
  const [documentRows, setDocumentRows] = useState<UploadRow[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSessionSummary[]>([]);
  const [notice, setNotice] = useState("");

  const handleUnauthorized = useCallback(() => {
    router.replace("/login");
  }, [router]);

  const authenticatedFetch = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    try {
      return await apiFetch(input, init);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleUnauthorized();
      }
      throw error;
    }
  }, [handleUnauthorized]);

  const handleNavigate = useCallback((view: BusinessView) => {
    if (ROUTED_VIEWS.has(view)) {
      router.push("/" + view);
    } else {
      router.push("/?view=" + view);
    }
  }, [router]);

  const handleLogout = useCallback(async () => {
    await auth.logout().catch(() => {});
    router.replace("/login");
  }, [auth, router]);

  useEffect(() => {
    if (auth.status !== "authenticated") return;

    async function load() {
      try {
        const kbsResponse = await authenticatedFetch("/api/kbs");
        const kbsRaw: BackendKnowledgeBase[] = await kbsResponse.json();
        const kbs = kbsRaw.map(mapKnowledgeBase);

        const documentRequests = kbs.map(async (kb) => {
          const response = await authenticatedFetch(`/api/documents?knowledge_base_id=${encodeURIComponent(kb.id)}`);
          const documents: BackendDocument[] = await response.json();
          return documents.map((document) => mapDocument(document, kbs));
        });
        const results = await Promise.allSettled(documentRequests);
        const rows = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
        const failedCount = results.filter((result) => result.status === "rejected").length;

        setAvailableKbs(withKbStats(kbs, rows));
        setDocumentRows(rows);
        setNotice(failedCount > 0 ? `运营数据已加载，${failedCount} 个知识库的文件列表暂时加载失败。` : "");

        const sessionsResponse = await authenticatedFetch("/api/sessions");
        const sessions: ChatSessionSummary[] = await sessionsResponse.json();
        setChatSessions(sessions);
      } catch (error) {
        console.error(error);
        setNotice("运营总览数据加载失败，请稍后重试。");
      }
    }

    void load();
  }, [auth.status, authenticatedFetch]);

  return (
    <AuthGate>
      <AppShell
        active="dashboard"
        onNavigate={handleNavigate}
        title="运营总览"
        role={role}
        orgName={auth.org?.name ?? "未识别组织"}
        departmentName={auth.department?.name ?? "未识别部门"}
        userName={auth.user?.full_name || auth.user?.username || "当前用户"}
        onLogout={handleLogout}
        notice={notice}
      >
        <Dashboard
          onEnterChat={() => router.push("/chat")}
          onEnterIngestion={() => router.push("/ingestion")}
          onEnterWorkflow={() => router.push("/workflow")}
          onEnterHistory={() => router.push("/history")}
          kbs={availableKbs}
          documentRows={documentRows}
          chatSessions={chatSessions}
        />
      </AppShell>
    </AuthGate>
  );
}

export default function DashboardRoute() {
  return <DashboardPageContent />;
}
