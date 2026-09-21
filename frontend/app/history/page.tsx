"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGate } from "@/features/auth/AuthGate";
import { useAuth } from "@/features/auth/hooks";
import type { Role } from "@/features/auth/types";
import { mapBackendRole } from "@/features/auth/utils";
import { HistoryPage } from "@/features/chat/HistoryPage";
import type {
  ChatMessage,
  ChatSessionSummary,
} from "@/features/chat/types";
import { apiFetch } from "@/lib/apiClient";
import { ROUTED_VIEWS, type BusinessView } from "@/lib/routing";
import { ApiError } from "@/types/common";

function HistoryPageContent() {
  const router = useRouter();
  const auth = useAuth();
  const role: Role = auth.user ? mapBackendRole(auth.user.role) : "普通用户";

  const [chatSessions, setChatSessions] = useState<ChatSessionSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
        const res = await authenticatedFetch("/api/sessions");
        const sessions: ChatSessionSummary[] = await res.json();
        setChatSessions(sessions);
      } catch (error) {
        console.error(error);
      }
    }

    void load();
  }, [auth.status, authenticatedFetch]);

  useEffect(() => {
    try {
      const cached = window.localStorage.getItem("active_chat_messages");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          setMessages(parsed);
        }
      }
    } catch {
      // 解析失败保持 []
    }
  }, []);

  return (
    <AuthGate>
      <AppShell
        active="history"
        onNavigate={handleNavigate}
        title="问答历史"
        role={role}
        orgName={auth.org?.name ?? "未识别组织"}
        departmentName={auth.department?.name ?? "未识别部门"}
        userName={auth.user?.full_name || auth.user?.username || "当前用户"}
        onLogout={handleLogout}
        notice={notice}
      >
        <HistoryPage
          sessions={chatSessions}
          messages={messages}
          setNotice={setNotice}
        />
      </AppShell>
    </AuthGate>
  );
}

export default function HistoryRoute() {
  return <HistoryPageContent />;
}
