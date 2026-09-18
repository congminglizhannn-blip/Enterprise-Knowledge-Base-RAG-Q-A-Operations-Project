import { FileText } from "lucide-react";
import type { DocumentDetail } from "./types";

export function DocumentDetailModal({ document, onClose }: { document: DocumentDetail; onClose: () => void }) {
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
          {document.chunks.length === 0 ? (
            <div className="empty-table-state">
              <FileText size={24} />
              <strong>暂无可预览 Chunk</strong>
            </div>
          ) : (
            <div className="chunk-preview-list">
              {document.chunks.map((chunk) => (
                <article key={chunk.id}>
                  <strong>Chunk {chunk.chunk_index + 1}</strong>
                  <p>{chunk.content}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
