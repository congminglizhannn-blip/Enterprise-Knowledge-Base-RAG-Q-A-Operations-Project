"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGate } from "@/features/auth/AuthGate";
import { useAuth } from "@/features/auth/hooks";
import type { Role } from "@/features/auth/types";
import { mapBackendRole } from "@/features/auth/utils";
import { ChatPage } from "@/features/chat/ChatPage";
import type { ChatMessage, ChatSessionSummary, CitationRow } from "@/features/chat/types";
import type { BackendKnowledgeBase, KnowledgeBase, UploadRow } from "@/features/documents/types";
import { apiFetch } from "@/lib/apiClient";
import { toFriendlyError } from "@/lib/errors";
import { ROUTED_VIEWS, type BusinessView } from "@/lib/routing";
import { ApiError, type AuthenticatedFetch } from "@/types/common";

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

function ChatPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const kbId = searchParams.get("kb")?.trim().replace(/^<|>$/g, "") || null;
  const auth = useAuth();
  const role: Role = auth.user ? mapBackendRole(auth.user.role) : "普通用户";
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null);
  const [availableKbs, setAvailableKbs] = useState<KnowledgeBase[]>([]);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [citations, setCitations] = useState<CitationRow[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [chatSessions, setChatSessions] = useState<ChatSessionSummary[]>([]);
  const [loadNotice, setLoadNotice] = useState("");

  const handleUnauthorized = useCallback(() => {
    router.replace("/login");
  }, [router]);

  const authenticatedFetch: AuthenticatedFetch = useCallback(async (input, init = {}) => {
    try {
      return await apiFetch(input, init);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleUnauthorized();
      }
      throw error;
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    let cancelled = false;

    async function load() {
      const [kbsResult, sessionsResult] = await Promise.allSettled([
        authenticatedFetch("/api/kbs").then((response) => response.json() as Promise<BackendKnowledgeBase[]>),
        authenticatedFetch("/api/sessions").then((response) => response.json() as Promise<ChatSessionSummary[]>),
      ]);
      if (cancelled) return;
      const errors: string[] = [];
      if (kbsResult.status === "fulfilled") {
        const kbs = kbsResult.value.map(mapKnowledgeBase);
        const enrichedKbs = withKbStats(kbs, []);
        setAvailableKbs(enrichedKbs);
        setSelectedKb(enrichedKbs.find((kb) => kb.id === kbId) ?? enrichedKbs[0] ?? null);

      } else {
        setAvailableKbs([]);
        setSelectedKb(null);
        errors.push(`知识库加载失败：${toFriendlyError(kbsResult.reason, "请稍后刷新重试。")}`);
      }
      if (sessionsResult.status === "fulfilled") {
        setChatSessions(sessionsResult.value);
      } else {
        errors.push(`历史会话加载失败：${toFriendlyError(sessionsResult.reason, "请稍后刷新重试。")}`);
      }
      setLoadNotice(errors.join("；"));
    }

    void load();
    return () => { cancelled = true; };
  }, [auth.status, authenticatedFetch, kbId]);

  const handleNavigate = useCallback((view: BusinessView) => {
    if (ROUTED_VIEWS.has(view)) {
      router.push(`/${view}`);
    } else {
      router.push(`/?view=${view}`);
    }
  }, [router]);

  const refreshSessions = useCallback(async () => {
    if (auth.status !== "authenticated") return;
    const response = await authenticatedFetch("/api/sessions");
    setChatSessions(await response.json());
  }, [auth.status, authenticatedFetch]);

  async function handleLogout() {
    router.replace("/login");
    await auth.logout().catch(() => {});
  }

  return (
    <AuthGate>
      <AppShell
        active="chat"
        onNavigate={handleNavigate}
        title="知识库问答"
        role={role}
        orgName={auth.org?.name ?? "未识别组织"}
        departmentName={auth.department?.name ?? "未识别部门"}
        userName={auth.user?.full_name || auth.user?.username || "当前用户"}
        onLogout={handleLogout}
        notice={loadNotice}
      >
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
      </AppShell>
    </AuthGate>
  );
}

export default function ChatRoute() {
  return (
    <Suspense fallback={null}>
      <ChatPageContent />
    </Suspense>
  );
}
