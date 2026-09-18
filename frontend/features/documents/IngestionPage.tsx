import React, { useEffect, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ApiError } from "@/types/common";
import { deleteDocument, parseDocument, uploadFile, uploadLink } from "./api";
import { DocumentTable } from "./DocumentTable";
import type { KnowledgeBase, UploadRow } from "./types";

type IngestionPageProps = {
  selectedKb: KnowledgeBase | null;
  availableKbs: KnowledgeBase[];
  role: "超级管理员" | "部门管理员" | "普通用户";
  documentRows: UploadRow[];
  setDocumentRows: React.Dispatch<React.SetStateAction<UploadRow[]>>;
  refreshDocuments: () => Promise<void>;
};

function detectDisplayType(fileName: string) {
  const suffix = fileName.split(".").pop()?.toLowerCase();
  if (suffix === "pdf") return "PDF";
  if (suffix === "docx") return "Word";
  if (suffix === "xlsx" || suffix === "xlsm") return "Excel";
  return "待校验";
}

function makeTime() {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

const NETWORK_ERROR_MESSAGE = "网络异常，请检查连接后重试。";

function isOfflineNow() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function toFriendlyError(error: unknown, fallback: string) {
  if (error instanceof ApiError && (error.status === 0 || error.code === "NETWORK_ERROR")) {
    return NETWORK_ERROR_MESSAGE;
  }
  if (error instanceof ApiError && error.message) return error.message;
  return fallback;
}

export function IngestionPage({
  selectedKb,
  availableKbs,
  role,
  documentRows,
  setDocumentRows,
  refreshDocuments,
}: IngestionPageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [mode, setMode] = useState<"file" | "link">("file");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadHint, setUploadHint] = useState("选择文件或链接后点击上传，上传后需要在下方手动解析入库。");
  const [toastMessage, setToastMessage] = useState("");
  const [targetKbId, setTargetKbId] = useState(selectedKb?.id ?? "");
  const [linkUrl, setLinkUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const selectedTargetKb = availableKbs.find((kb) => kb.id === targetKbId) ?? selectedKb ?? null;
  const canManageSelectedKb = Boolean(selectedTargetKb && (role === "超级管理员" || (role === "部门管理员" && selectedTargetKb.scope === "department")));
  const canUpload = Boolean(canManageSelectedKb && selectedTargetKb && targetKbId && ((mode === "file" && selectedFiles.length > 0) || (mode === "link" && linkUrl.trim())));
  const canDeleteDocuments = role === "超级管理员" || role === "部门管理员";

  useEffect(() => {
    setTargetKbId(selectedKb?.id ?? availableKbs[0]?.id ?? "");
  }, [availableKbs, selectedKb?.id]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  function showToast(message: string) {
    setToastMessage(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage("");
      toastTimerRef.current = null;
    }, 1000);
  }

  function handleFiles(files: FileList | null) {
    const nextFiles = Array.from(files ?? []);
    if (!nextFiles.length) return;
    setSelectedFiles(nextFiles);
    showToast(`已选择 ${nextFiles.length} 个文件`);
  }

  function clearUploadSelection() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSelectedFiles([]);
    setLinkUrl("");
    showToast("已清除当前选择");
  }

  async function handleUpload() {
    if (!selectedTargetKb || !targetKbId) {
      showToast("当前账号暂无可用知识库");
      return;
    }
    if (!canManageSelectedKb) {
      showToast("该知识库对当前账号只读");
      return;
    }
    if (!canUpload) {
      showToast("请先选择文件或粘贴公开链接");
      return;
    }
    if (isOfflineNow()) {
      showToast(NETWORK_ERROR_MESSAGE);
      return;
    }
    setIsUploading(true);
    showToast(`正在上传到 ${selectedTargetKb.name}`);
    try {
      if (mode === "file") {
        for (const file of selectedFiles) {
          const document = await uploadFile(targetKbId, file);
          setDocumentRows((current) => [{
            id: document.id,
            kbId: document.knowledge_base_id,
            name: document.file_name,
            type: detectDisplayType(document.file_name),
            source: selectedTargetKb.name,
            status: "待解析",
            chunks: document.chunk_count ?? 0,
            owner: "当前用户",
            time: makeTime(),
          }, ...current]);
        }
        setSelectedFiles([]);
      } else {
        const document = await uploadLink(targetKbId, linkUrl.trim());
        setDocumentRows((current) => [{
          id: document.id,
          kbId: document.knowledge_base_id,
          name: document.file_name ?? "公开链接",
          type: "Link",
          source: selectedTargetKb.name,
          status: "待解析",
          chunks: document.chunk_count ?? 0,
          owner: "当前用户",
          time: makeTime(),
        }, ...current]);
        setLinkUrl("");
      }
      showToast("上传完成，请在下方点击解析");
      await refreshDocuments();
    } catch (error) {
      showToast(toFriendlyError(error, "上传失败，请确认文件/链接有效且账号有权限。"));
    } finally {
      setIsUploading(false);
    }
  }

  async function handleParse(row: UploadRow) {
    if (!row.id) return;
    if (isOfflineNow()) {
      showToast(NETWORK_ERROR_MESSAGE);
      return;
    }
    setDocumentRows((current) => current.map((doc) => doc.id === row.id ? { ...doc, status: "解析中" } : doc));
    showToast("正在解析文档");
    try {
      const document = await parseDocument(row.id);
      setDocumentRows((current) => current.map((doc) => doc.id === row.id ? { ...doc, status: document.status === "completed" ? "解析完成" : document.status, chunks: document.chunk_count ?? 0 } : doc));
      await refreshDocuments();
      showToast("解析完成");
    } catch (error) {
      setDocumentRows((current) => current.map((doc) => doc.id === row.id ? { ...doc, status: "解析失败" } : doc));
      showToast(toFriendlyError(error, "解析失败，请检查文件类型或链接可访问性。"));
    }
  }

  async function handleDeleteDocument(row: UploadRow) {
    if (!row.id) return;
    if (isOfflineNow()) {
      showToast(NETWORK_ERROR_MESSAGE);
      return;
    }
    const confirmed = window.confirm(`删除文档「${row.name}」会同时删除其 Chunk 和向量数据，是否继续？`);
    if (!confirmed) return;
    try {
      await deleteDocument(row.id);
      setDocumentRows((current) => current.filter((doc) => doc.id !== row.id));
      await refreshDocuments();
      showToast("文档已删除");
    } catch (error) {
      showToast(toFriendlyError(error, "删除失败，请确认当前账号具备权限。"));
    }
  }

  return (
    <section className="content-stack">
      {toastMessage && <div className="mini-toast" role="status">{toastMessage}</div>}
      <Card title="文档入库">
        <div className="ingestion-panel">
          <div className="mode-switch">
            <button className={mode === "file" ? "active" : ""} onClick={() => setMode("file")}>上传文件</button>
            <button className={mode === "link" ? "active" : ""} onClick={() => setMode("link")}>粘贴链接</button>
          </div>
          <label>目标知识库</label>
          <select value={targetKbId} disabled={availableKbs.length === 0} onChange={(event) => setTargetKbId(event.target.value)}>
            {availableKbs.length === 0 && <option value="">暂无可用知识库</option>}
            {availableKbs.map((kb) => <option key={kb.id} value={kb.id}>{kb.name} · {scopeLabel(kb.scope)}</option>)}
          </select>
          {selectedTargetKb && !canManageSelectedKb && <p className="muted-text">当前知识库为只读范围，您可以在问答页使用，但不能上传文档。</p>}
          {mode === "file" ? (
          <div className="dropzone compact">
            <UploadCloud size={38} />
            <strong>拖拽 Word / Excel / 文本型 PDF 到此处</strong>
            <span>单文件不超过 10MB，扫描件暂不支持，请上传文本型 PDF。</span>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              multiple
              accept=".pdf,.docx,.xlsx,.xlsm"
              onChange={(event) => handleFiles(event.target.files)}
            />
            <button
              className="primary-btn small"
              onClick={() => {
                if (fileInputRef.current) fileInputRef.current.value = "";
                fileInputRef.current?.click();
              }}
            >
              选择上传文件
            </button>
            {selectedFiles.length > 0 && (
              <div className="selected-file-list" aria-live="polite">
                <strong>已选择 {selectedFiles.length} 个文件</strong>
                {selectedFiles.map((file) => (
                  <span key={`${file.name}-${file.size}`}>{file.name}</span>
                ))}
              </div>
            )}
          </div>
          ) : (
          <div className="link-import">
            <label>公开链接</label>
            <div className="input-action">
              <input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="粘贴公开可访问的飞书链接" />
            </div>
          </div>
          )}
          <div className="ingestion-actions">
            <button className="primary-btn small" disabled={!canUpload || isUploading} onClick={handleUpload}>上传</button>
            <button className="secondary-btn small" disabled={isUploading || (selectedFiles.length === 0 && !linkUrl.trim())} onClick={clearUploadSelection}>清除</button>
            <small>{uploadHint}</small>
          </div>
        </div>
      </Card>
      <Card title="文档解析状态">
        <DocumentTable
          documents={documentRows}
          variant="ingestion"
          emptyTitle="选择上传文件"
          onParse={handleParse}
          canDelete={canDeleteDocuments}
          onDelete={handleDeleteDocument}
        />
      </Card>
    </section>
  );
}

function scopeLabel(scope?: string) {
  if (scope === "global") return "公共";
  if (scope === "organization") return "组织";
  return "部门";
}
