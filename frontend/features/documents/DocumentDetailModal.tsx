import { useEffect, useState } from "react";
import { FileImage, FileText } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { getDocumentSource } from "./api";
import type { DocumentDetail } from "./types";

type DetailView = "original" | "chunks" | "markdown";

export function DocumentDetailModal({ document, onClose }: { document: DocumentDetail; onClose: () => void }) {
  const [view, setView] = useState<DetailView>("original");
  const [source, setSource] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState("");
  const [loadingSource, setLoadingSource] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingSource(true);
    getDocumentSource(document.id)
      .then((response) => { if (active) setSource(response.content); })
      .catch((error: unknown) => {
        if (active) setSourceError(error instanceof Error ? error.message : "读取 Markdown 原文失败");
      })
      .finally(() => { if (active) setLoadingSource(false); });
    return () => { active = false; };
  }, [document.id]);

  const statusMap: Record<string, string> = {
    pending: "待解析",
    processing: "解析中",
    completed: "解析完成",
    failed: "解析失败",
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="document-modal">
        <header>
          <div>
            <span>文件详情</span>
            <h3>{document.file_name}</h3>
          </div>
          <button className="icon-btn" onClick={onClose}>×</button>
        </header>
        <div className="document-modal-body">
          <div className="document-meta">
            <span>{document.file_type}</span>
            <span>{statusMap[document.status] ?? document.status}</span>
            <span>Chunk {document.chunk_count}</span>
          </div>
          {document.error_message && <p className="form-error compact">{document.error_message}</p>}
          <div className="document-view-tabs" role="tablist" aria-label="文档内容视图">
            {([ ["original", "原文"], ["chunks", "Chunk"], ["markdown", "Markdown 源码"] ] as const).map(([value, label]) => (
              <button key={value} role="tab" aria-selected={view === value} className={view === value ? "active" : ""} onClick={() => setView(value)}>{label}</button>
            ))}
          </div>
          {view !== "chunks" && sourceError && source === null ? (
            <div className="empty-table-state"><FileText size={24} /><strong>{sourceError}</strong><span>请重新解析文档以保存原文。</span></div>
          ) : view !== "chunks" && loadingSource && source === null ? (
            <div className="empty-table-state"><FileText size={24} /><strong>正在读取原文…</strong></div>
          ) : view === "original" ? (
            source ? <article className="markdown-body">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSanitize]}
                components={{
                  table: ({ children }) => <div className="markdown-table-scroll"><table>{children}</table></div>,
                  img: ({ alt }) => <div className="markdown-image-placeholder" role="img" aria-label={alt || "文档图片"}><FileImage size={18} /><span>{alt || "文档图片"}</span><small>图片资源暂不可预览</small></div>,
                  a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
                } satisfies Components}
              >{source}</ReactMarkdown>
            </article> : <div className="empty-table-state"><FileText size={24} /><strong>原文为空</strong></div>
          ) : view === "markdown" ? (
            source !== null ? <pre className="source-markdown-preview">{source}</pre> : <div className="empty-table-state"><FileText size={24} /><strong>暂无 Markdown 原文</strong></div>
          ) : document.chunks.length === 0 ? (
            <div className="empty-table-state"><FileText size={24} /><strong>暂无可预览 Chunk</strong></div>
          ) : (
            <div className="chunk-preview-list">
              {document.chunks.map((chunk) => <article key={chunk.id}><strong>Chunk {chunk.chunk_index + 1}</strong><p>{chunk.content}</p></article>)}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
