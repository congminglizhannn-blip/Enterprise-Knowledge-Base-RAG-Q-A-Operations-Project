"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGate } from "@/features/auth/AuthGate";
import { useAuth } from "@/features/auth/hooks";
import type { Role } from "@/features/auth/types";
import { mapBackendRole } from "@/features/auth/utils";
import { AdminPage } from "@/features/admin/AdminPage";
import { apiFetch } from "@/lib/apiClient";
import { ROUTED_VIEWS, type BusinessView } from "@/lib/routing";
import { ApiError } from "@/types/common";

function AdminPageContent() {
  const router = useRouter();
  const auth = useAuth();
  const role: Role = auth.user ? mapBackendRole(auth.user.role) : "普通用户";
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

  const refreshDocuments = useCallback(async () => {
    if (auth.status !== "authenticated") return;
    try {
      const kbsResponse = await authenticatedFetch("/api/kbs");
      const kbs: Array<{ id: string }> = await kbsResponse.json();
      await Promise.allSettled(
        kbs.map((kb) => authenticatedFetch(`/api/documents?knowledge_base_id=${encodeURIComponent(kb.id)}`)),
      );
      setNotice("知识库和文件列表已刷新。");
    } catch {
      setNotice("刷新知识库和文件失败。");
    }
  }, [auth.status, authenticatedFetch]);

  return (
    <AuthGate>
      <AppShell
        active="admin"
        onNavigate={handleNavigate}
        title="系统管理"
        role={role}
        orgName={auth.org?.name ?? "未识别组织"}
        departmentName={auth.department?.name ?? "未识别部门"}
        userName={auth.user?.full_name || auth.user?.username || "当前用户"}
        onLogout={handleLogout}
        notice={notice}
      >
        <AdminPage
          role={role}
          refreshDocuments={refreshDocuments}
          authenticatedFetch={authenticatedFetch}
        />
      </AppShell>
    </AuthGate>
  );
}

export default function AdminRoute() {
  return <AdminPageContent />;
}
