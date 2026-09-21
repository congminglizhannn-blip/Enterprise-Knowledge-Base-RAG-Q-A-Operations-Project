"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGate } from "@/features/auth/AuthGate";
import { useAuth } from "@/features/auth/hooks";
import type { Role } from "@/features/auth/types";
import { mapBackendRole } from "@/features/auth/utils";
import { IngestionPage } from "@/features/documents/IngestionPage";
import type { BackendDocument, BackendKnowledgeBase, KnowledgeBase, UploadRow } from "@/features/documents/types";
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

function IngestionPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const kbId = searchParams.get("kb")?.trim().replace(/^<|>$/g, "") || null;
  const auth = useAuth();
  const role: Role = auth.user ? mapBackendRole(auth.user.role) : "普通用户";
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null);
  const [availableKbs, setAvailableKbs] = useState<KnowledgeBase[]>([]);
  const [documentRows, setDocumentRows] = useState<UploadRow[]>([]);
  const [notice, setNotice] = useState("");

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

  const loadKnowledgeBases = useCallback(async () => {
    const response = await authenticatedFetch("/api/kbs");
    const kbs: BackendKnowledgeBase[] = await response.json();
    return kbs.map(mapKnowledgeBase);
  }, [authenticatedFetch]);

  const loadDocuments = useCallback(async (kbs: KnowledgeBase[], options: { tolerateFailures?: boolean } = {}) => {
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
  }, [authenticatedFetch]);

  const refreshDocuments = useCallback(async (nextKbs?: KnowledgeBase[]) => {
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
  }, [auth.status, loadDocuments, loadKnowledgeBases]);

  const handleLogout = useCallback(async () => {
    await auth.logout().catch(() => {});
    router.replace("/login");
  }, [auth, router]);

  const handleNavigate = useCallback((view: BusinessView) => {
    if (ROUTED_VIEWS.has(view)) {
      router.push(`/${view}`);
    } else {
      router.push(`/?view=${view}`);
    }
  }, [router]);

  useEffect(() => {
    if (auth.status !== "authenticated") return;

    async function load() {
      try {
        const kbs = await loadKnowledgeBases();
        const { rows } = await loadDocuments(kbs, { tolerateFailures: true });
        const kbsWithStats = withKbStats(kbs, rows);
        setAvailableKbs(kbsWithStats);
        setDocumentRows(rows);
        setSelectedKb(kbsWithStats.find((kb) => kb.id === kbId) ?? kbsWithStats[0] ?? null);
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) {
          console.error(error);
        }
      }
    }

    void load();
  }, [auth.status, kbId, loadDocuments, loadKnowledgeBases]);

  return (
    <AuthGate>
      <AppShell
        active="ingestion"
        onNavigate={handleNavigate}
        title="文档入库"
        role={role}
        orgName={auth.org?.name ?? "未识别组织"}
        departmentName={auth.department?.name ?? "未识别部门"}
        userName={auth.user?.full_name || auth.user?.username || "当前用户"}
        onLogout={handleLogout}
        notice={notice}
      >
        <IngestionPage
          selectedKb={selectedKb}
          availableKbs={availableKbs}
          role={role}
          documentRows={documentRows}
          setDocumentRows={setDocumentRows}
          refreshDocuments={refreshDocuments}
        />
      </AppShell>
    </AuthGate>
  );
}

export default function IngestionRoute() {
  return (
    <Suspense fallback={null}>
      <IngestionPageContent />
    </Suspense>
  );
}
