"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/features/auth/hooks";
import type { Role } from "@/features/auth/types";
import { mapBackendRole } from "@/features/auth/utils";
import { sortUploadRows } from "@/features/documents/documentRows";
import { KnowledgePage } from "@/features/documents/KnowledgePage";
import type {
  BackendDocument,
  BackendKnowledgeBase,
  KnowledgeBase,
  UploadRow,
} from "@/features/documents/types";
import { apiFetch, clearReadCache } from "@/lib/apiClient";
import { toFriendlyError } from "@/lib/errors";
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
    createdAt: document.created_at,
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

function KnowledgePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusKbId = searchParams.get("kb")?.trim().replace(/^<|>$/g, "") || undefined;
  const auth = useAuth();
  const role: Role = auth.user ? mapBackendRole(auth.user.role) : "普通用户";
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null);
  const [availableKbs, setAvailableKbs] = useState<KnowledgeBase[]>([]);
  const [documentRows, setDocumentRows] = useState<UploadRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
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

  const loadKnowledgeBases = useCallback(async () => {
    const response = await authenticatedFetch("/api/kbs");
    const kbs: BackendKnowledgeBase[] = await response.json();
    return kbs.map(mapKnowledgeBase);
  }, [authenticatedFetch]);

  const loadDocuments = useCallback(async (kbs: KnowledgeBase[]) => {
    const requests = kbs.map(async (kb) => {
      const response = await authenticatedFetch(`/api/documents?knowledge_base_id=${encodeURIComponent(kb.id)}`);
      const documents: BackendDocument[] = await response.json();
      return documents.map((document) => mapDocument(document, kbs));
    });
    const results = await Promise.allSettled(requests);
    const rows = sortUploadRows(results.flatMap((result) => result.status === "fulfilled" ? result.value : []));
    const failedCount = results.filter((result) => result.status === "rejected").length;
    return { rows, failedCount };
  }, [authenticatedFetch]);

  const refreshDocuments = useCallback(async (nextKbs?: KnowledgeBase[]) => {
    clearReadCache();
    if (auth.status !== "authenticated") return;
    try {
      const kbs = nextKbs ?? await loadKnowledgeBases();
      const { rows, failedCount } = await loadDocuments(kbs);
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
  }, [auth.status, loadKnowledgeBases, loadDocuments]);

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    if (availableKbs.length > 0) return;

    async function load() {
      try {
        const kbs = await loadKnowledgeBases();
        const { rows } = await loadDocuments(kbs);
        const enrichedKbs = withKbStats(kbs, rows);
        setAvailableKbs(enrichedKbs);
        setDocumentRows(rows);
        const target = focusKbId ? enrichedKbs.find((kb) => kb.id === focusKbId) ?? enrichedKbs[0] ?? null : enrichedKbs[0] ?? null;
        setSelectedKb(target);
      } catch (error) {
        setNotice("页面数据加载失败，请刷新页面重试。");
      } finally {
        setLoadingData(false);
      }
    }

    void load();
  }, [auth.status, availableKbs.length, loadKnowledgeBases, loadDocuments, focusKbId]);

  return (
    <>
      {notice && <div className="notice-bar">{notice}</div>}

        {loadingData ? <div role="status" className="p-6 text-sm text-gray-500">正在加载数据...</div> : <KnowledgePage
          focusKbId={focusKbId}
          setSelectedKb={setSelectedKb}
          onEnterChat={(kb) => router.push(`/chat?kb=${encodeURIComponent(kb.id)}`)}
          onEnterIngestion={(kb) => router.push(`/ingestion?kb=${encodeURIComponent(kb.id)}`)}
          kbs={availableKbs}
          documentRows={documentRows}
          refreshDocuments={refreshDocuments}
          setNotice={setNotice}
          canDeleteDocuments={role === "超级管理员" || role === "部门管理员"}
        />}
    </>
  );
}

export default function KnowledgeRoute() {
  return (
    <Suspense fallback={null}>
      <KnowledgePageContent />
    </Suspense>
  );
}
