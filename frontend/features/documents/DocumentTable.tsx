import { FileText, UploadCloud } from "lucide-react";
import type { UploadRow } from "./types";

type DocumentTableProps = {
  documents: UploadRow[];
  emptyTitle?: string;
  variant?: "files" | "ingestion";
  canDelete?: boolean;
  onView?: (document: UploadRow) => void;
  onParse?: (document: UploadRow) => void;
  onDelete?: (document: UploadRow) => void;
};

export function DocumentTable({
  documents,
  emptyTitle = "当前知识库暂无已解析文档",
  variant = "files",
  canDelete = false,
  onView,
  onParse,
  onDelete,
}: DocumentTableProps) {
  if (documents.length === 0) {
    const EmptyIcon = variant === "ingestion" ? UploadCloud : FileText;
    return (
      <div className="empty-table-state">
        <EmptyIcon size={26} />
        <strong>{emptyTitle}</strong>
      </div>
    );
  }

  if (variant === "ingestion") {
    return (
      <div className="table-wrap">
        <table>
          <thead><tr>{["文件名", "类型", "知识库", "状态", "Chunk", "上传者", "操作"].map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id ?? doc.name}>
                <td>{doc.name}</td>
                <td>{doc.type}</td>
                <td>{doc.source}</td>
                <td>{doc.status}</td>
                <td>{doc.chunks}</td>
                <td>{doc.owner}</td>
                <td>
                  <button className="table-action" disabled={!doc.id || doc.status === "解析中"} onClick={() => onParse?.(doc)}>解析</button>
                  {canDelete && <button className="table-action danger" disabled={!doc.id} onClick={() => onDelete?.(doc)}>删除</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="table-wrap scroll-table">
      <table>
        <thead><tr>{["文件名", "类型", "状态", "Chunk", "来源", "上传者", "时间", "操作"].map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id ?? doc.name}>
              <td>{doc.name}</td>
              <td>{doc.type}</td>
              <td>{doc.status}</td>
              <td>{doc.chunks}</td>
              <td>{doc.source}</td>
              <td>{doc.owner}</td>
              <td>{doc.time}</td>
              <td>
                <button className="table-action" disabled={!doc.id} onClick={() => onView?.(doc)}>查看</button>
                {canDelete && <button className="table-action danger" disabled={!doc.id} onClick={() => onDelete?.(doc)}>删除</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
