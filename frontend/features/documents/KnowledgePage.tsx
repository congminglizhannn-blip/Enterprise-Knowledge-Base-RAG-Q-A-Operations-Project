import React, { useEffect, useRef, useState } from "react";
import { FileText, Search } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ApiError } from "@/types/common";
import { deleteDocument, getDocument } from "./api";
import { DocumentDetailModal } from "./DocumentDetailModal";
import { DocumentTable } from "./DocumentTable";
import type { DocumentDetail, KnowledgeBase, UploadRow } from "./types";

type KnowledgePageProps = {
  focusKbId?: string;
  setSelectedKb: (kb: KnowledgeBase | null) => void;
  onEnterChat: (kb: KnowledgeBase) => void;
  onEnterIngestion: (kb: KnowledgeBase) => void;
  kbs: KnowledgeBase[];
  documentRows: UploadRow[];
  refreshDocuments: () => Promise<void>;
  setNotice: (notice: string) => void;
  canDeleteDocuments?: boolean;
};

function toFriendlyError(error: unknown, fallback: string) {
  if (error instanceof ApiError && (error.status === 0 || error.code === "NETWORK_ERROR")) {
    return "网络异常，请检查连接后重试。";
  }
  if (error instanceof ApiError && error.message) return error.message;
  return fallback;
}

export function KnowledgePage({
  focusKbId,
  setSelectedKb,
  onEnterChat,
  onEnterIngestion,
  kbs,
  documentRows,
  refreshDocuments,
  setNotice,
  canDeleteDocuments = false,
}: KnowledgePageProps) {
  const fileSectionRef = useRef<HTMLDivElement>(null);
  const handledFocusKbIdRef = useRef<string | null>(null);
  const [activeKbId, setActiveKbId] = useState(kbs[0]?.id ?? "");
  const [selectedDocument, setSelectedDocument] = useState<DocumentDetail | null>(null);
  const activeDocs = documentRows.filter((doc) => doc.kbId === activeKbId && doc.status === "解析完成");

  useEffect(() => {
    if (!activeKbId && kbs[0]?.id) setActiveKbId(kbs[0].id);
  }, [activeKbId, kbs]);

  async function openDocument(doc: UploadRow) {
    if (!doc.id) return;
    try {
      setSelectedDocument(await getDocument(doc.id));
    } catch (error) {
      setNotice(toFriendlyError(error, "打开文件详情失败，请确认后端服务和文档权限。"));
    }
  }

  async function viewKbFiles(kb: KnowledgeBase) {
    setSelectedKb(kb);
    setActiveKbId(kb.id);
    setNotice(`正在查看 ${kb.name} 的入库文件。`);
    try {
      await refreshDocuments();
    } catch (error) {
      setNotice(toFriendlyError(error, "刷新入库文件失败，请稍后重试。"));
    }
    window.setTimeout(() => fileSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  useEffect(() => {
    if (!focusKbId) return;
    if (handledFocusKbIdRef.current === focusKbId) return;

    const kb = kbs.find((item) => item.id === focusKbId);
    if (!kb) return;

    handledFocusKbIdRef.current = focusKbId;
    void viewKbFiles(kb);
  }, [focusKbId, kbs]);

  async function handleDeleteDocument(doc: UploadRow) {
    if (!doc.id) return;
    const confirmed = window.confirm(`删除文档「${doc.name}」会同时删除其 Chunk 和向量数据，是否继续？`);
    if (!confirmed) return;
    try {
      await deleteDocument(doc.id);
      setNotice("文档已删除，文件列表已刷新。");
      await refreshDocuments();
    } catch (error) {
      setNotice(toFriendlyError(error, "删除文档失败，请确认当前账号具备该知识库管理权限。"));
    }
  }

  return (
    <section className="content-stack">
      <div className="section-toolbar">
        <div className="search-box"><Search size={18} /><input placeholder="搜索知识库名称、部门或文档" /></div>
        <div className="toolbar-actions">
          <button className="secondary-btn" onClick={() => { void refreshDocuments(); }}>刷新知识库</button>
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
              <button onClick={() => onEnterChat(kb)}>进入问答</button>
              <button onClick={() => onEnterIngestion(kb)}>入库文档</button>
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
            <DocumentTable documents={activeDocs} onView={openDocument} canDelete={canDeleteDocuments} onDelete={handleDeleteDocument} />
          )}
        </Card>
      </div>
      {selectedDocument && <DocumentDetailModal document={selectedDocument} onClose={() => setSelectedDocument(null)} />}
    </section>
  );
}
