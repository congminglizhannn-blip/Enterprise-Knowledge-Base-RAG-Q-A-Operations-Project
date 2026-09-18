import { FileText } from "lucide-react";
import type { Citation } from "./types";

type Props = {
  citations: Citation[];
  hasMessages: boolean;
  disabled?: boolean;
  onOpenDocument: (citation: Citation) => void;
};

export function CitationPanel({
  citations,
  hasMessages,
  disabled = false,
  onOpenDocument,
}: Props) {
  return (
    <aside className="citation-panel">
      <h3>引用来源</h3>
      {!hasMessages ? (
        <div className="empty-citation">
          <FileText size={22} />
          <strong>暂无引用</strong>
          <p>提交问题并完成 RAG 召回后，这里才展示命中的文档名称和原文片段。</p>
        </div>
      ) : citations.length > 0 ? (
        citations.map((citation) => (
          <button
            className="citation-card"
            disabled={disabled}
            key={citation.chunk_id ?? `${citation.document_name}-${citation.content_preview}`}
            onClick={() => onOpenDocument(citation)}
          >
            <FileText size={18} />
            <strong>{citation.document_name}</strong>
            <p>{citation.content_preview}</p>
          </button>
        ))
      ) : (
        <div className="empty-citation">
          <FileText size={22} />
          <strong>未命中相关片段</strong>
          <p>本次问题没有检索到可引用的 chunk。请确认文档已解析完成，或换一种更贴近原文的问法。</p>
        </div>
      )}
    </aside>
  );
}
