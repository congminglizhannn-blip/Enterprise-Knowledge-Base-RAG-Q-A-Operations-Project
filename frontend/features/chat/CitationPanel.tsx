import { FileText } from "lucide-react";
import type { Citation } from "./types";
import { groupCitationsByDocument } from "./citations";

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
  const documents = groupCitationsByDocument(citations);
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
        documents.map(({ key, source, chunks }) => (
          <button
            className="citation-card"
            disabled={disabled || !source.document_id}
            key={key}
            onClick={() => onOpenDocument(source)}
          >
            <FileText size={18} />
            <strong>{source.document_name}</strong>
            <small>本次命中 {chunks.length} 个片段</small>
            {chunks.map((chunk, index) => (
              <span className="citation-chunk" key={chunk.chunk_id ?? chunk.content_preview}>
                <small title={chunk.chunk_id}>引用片段 {index + 1}</small>
                <span>{chunk.content_preview}</span>
              </span>
            ))}
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
