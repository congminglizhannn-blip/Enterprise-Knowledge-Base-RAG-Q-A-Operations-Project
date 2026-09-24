"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/hooks";
import type { Role } from "@/features/auth/types";
import { mapBackendRole } from "@/features/auth/utils";
import { AdminPage } from "@/features/admin/AdminPage";
import { apiFetch } from "@/lib/apiClient";
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
    <>
      {notice && <div className="notice-bar">{notice}</div>}

        <AdminPage
          role={role}
          refreshDocuments={refreshDocuments}
          authenticatedFetch={authenticatedFetch}
        />
    </>
  );
}

export default function AdminRoute() {
  return <AdminPageContent />;
}
