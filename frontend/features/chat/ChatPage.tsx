import React, { useState } from "react";

import { Card } from "@/components/ui/Card";
import { DocumentDetailModal } from "@/features/documents/DocumentDetailModal";
import type { DocumentDetail, KnowledgeBase } from "@/features/documents/types";
import { NETWORK_ERROR_MESSAGE, isOfflineNow, toFriendlyError } from "@/lib/errors";
import { ApiError, type AuthenticatedFetch } from "@/types/common";

import { CitationPanel } from "./CitationPanel";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import type { ChatMessage, ChatSessionSummary, CitationRow } from "./types";

type LoadedSessionMessage = ChatMessage & {
  created_at?: string;
  retrieved_chunks?: CitationRow[];
};

export type ChatPageProps = {
  selectedKb: KnowledgeBase | null;
  setSelectedKb: (kb: KnowledgeBase | null) => void;
  availableKbs: KnowledgeBase[];
  question: string;
  setQuestion: (value: string) => void;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  citations: CitationRow[];
  setCitations: (citations: CitationRow[]) => void;
  activeSessionId: string | null;
  setActiveSessionId: (sessionId: string | null) => void;
  chatSessions: ChatSessionSummary[];
  refreshSessions: () => Promise<void>;
  onUnauthorized: () => void;
  authenticatedFetch: AuthenticatedFetch;
};

export function ChatPage({
  selectedKb,
  setSelectedKb,
  availableKbs,
  question,
  setQuestion,
  messages,
  setMessages,
  citations,
  setCitations,
  activeSessionId,
  setActiveSessionId,
  chatSessions,
  refreshSessions,
  onUnauthorized,
  authenticatedFetch,
}: ChatPageProps) {
  const [selectedDocument, setSelectedDocument] = useState<DocumentDetail | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);

  async function openCitation(citation: CitationRow) {
    if (!citation.document_id) return;
    if (isOfflineNow()) {
      setMessages((current) => [...current, { role: "assistant", content: NETWORK_ERROR_MESSAGE }]);
      return;
    }
    setIsRequesting(true);
    try {
      const response = await authenticatedFetch(`/api/documents/${citation.document_id}`);
      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      if (!response.ok) throw new Error(await response.text());
      setSelectedDocument(await response.json());
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized();
        return;
      }
      setMessages((current) => [...current, { role: "assistant", content: toFriendlyError(error, "文件详情打开失败，请确认后端服务和文档权限。") }]);
    } finally {
      setIsRequesting(false);
    }
  }

  async function loadSession(sessionId: string) {
    if (isRequesting) return;
    if (isOfflineNow()) {
      setMessages((current) => [...current, { role: "assistant", content: NETWORK_ERROR_MESSAGE }]);
      return;
    }
    setIsRequesting(true);
    try {
      const response = await authenticatedFetch(`/api/sessions/${sessionId}`);
      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      if (!response.ok) throw new Error(await response.text());
      const session = await response.json();
      const kb = availableKbs.find((item) => item.id === session.knowledge_base_id);
      if (kb) setSelectedKb(kb);
      setActiveSessionId(session.id);
      const orderedMessages = [...(session.messages as LoadedSessionMessage[])].sort((left, right) => {
        const timeDiff = new Date(left.created_at ?? 0).getTime() - new Date(right.created_at ?? 0).getTime();
        if (timeDiff !== 0) return timeDiff;
        if (left.role === right.role) return 0;
        return left.role === "user" ? -1 : 1;
      });
      setMessages(orderedMessages.map((message) => ({ role: message.role, content: message.content })));
      const lastAssistant = [...orderedMessages].reverse().find((message) => message.role === "assistant" && message.retrieved_chunks);
      setCitations(lastAssistant?.retrieved_chunks ?? []);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized();
        return;
      }
      setMessages((current) => [...current, { role: "assistant", content: toFriendlyError(error, "会话加载失败，请确认后端服务和当前账号权限。") }]);
    } finally {
      setIsRequesting(false);
    }
  }

  async function ask() {
    if (isRequesting) return;
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) return;
    if (isOfflineNow()) {
      setMessages((current) => [...current, { role: "assistant", content: NETWORK_ERROR_MESSAGE }]);
      return;
    }
    if (!selectedKb) {
      setMessages((current) => [...current, { role: "assistant", content: "当前账号暂无可用知识库，请先由管理员创建知识库或切换到有权限的组织。" }]);
      return;
    }
    setMessages((current) => [...current, { role: "user", content: trimmedQuestion }, { role: "assistant", content: "正在检索当前知识库..." }]);
    setCitations([]);
    setQuestion("");
    setIsRequesting(true);
    try {
      const response = await authenticatedFetch("/api/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ knowledge_base_id: selectedKb.id, question: trimmedQuestion, session_id: activeSessionId }),
      });
      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      if (!response.ok || !response.body) throw new Error(await response.text());
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      const handleBlock = (block: string) => {
        const normalizedBlock = block.replace(/\r\n/g, "\n");
        const eventType = normalizedBlock.match(/^event:\s*(.+)$/m)?.[1]?.trim();
        const dataLines = normalizedBlock.split("\n").filter((line) => line.startsWith("data:"));
        const data = dataLines.map((line) => line.replace(/^data:\s?/, "")).join("\n");
        if (!data) return;
        if (eventType === "metadata" || eventType === "done") {
          const parsed = JSON.parse(data);
          if (parsed.session_id) setActiveSessionId(parsed.session_id);
          if (parsed.citations) setCitations(parsed.citations);
          if (eventType === "done") refreshSessions();
        }
        if (eventType === "delta") {
          answer += data;
          setMessages((current) => current.map((msg, index) => index === current.length - 1 ? { ...msg, content: answer } : msg));
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          if (buffer.trim()) handleBlock(buffer);
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          handleBlock(block);
        }
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized();
        return;
      }
      setMessages((current) => current.map((msg, index) => index === current.length - 1 ? { ...msg, content: toFriendlyError(error, "问答失败，请确认后端服务、DeepSeek 配置和当前知识库解析状态。") } : msg));
    } finally {
      setIsRequesting(false);
    }
  }

  return (
    <section className="chat-layout">
      <aside className="chat-side">
        <label>当前知识库</label>
        <select value={selectedKb?.id ?? ""} disabled={availableKbs.length === 0} onChange={(event) => setSelectedKb(availableKbs.find((kb) => kb.id === event.target.value) ?? null)}>
          {availableKbs.length === 0 && <option value="">暂无可用知识库</option>}
          {availableKbs.map((kb) => <option key={kb.id} value={kb.id}>{kb.name}</option>)}
        </select>
        <h3>历史会话</h3>
        {chatSessions.length === 0 ? (
          <div className="empty-mini">暂无历史会话</div>
        ) : chatSessions.map((session) => (
          <button
            className={`session-item ${activeSessionId === session.id ? "active" : ""}`}
            key={session.id}
            disabled={isRequesting}
            onClick={() => loadSession(session.id)}
          >
            {session.title}
          </button>
        ))}
      </aside>
      <Card title="对话窗口" className="chat-window">
        <MessageList messages={messages} />
        <Composer question={question} disabled={isRequesting} onQuestionChange={setQuestion} onSubmit={ask} />
      </Card>
      <CitationPanel
        citations={citations}
        hasMessages={messages.length > 0}
        disabled={isRequesting}
        onOpenDocument={openCitation}
      />
      {selectedDocument && <DocumentDetailModal document={selectedDocument} onClose={() => setSelectedDocument(null)} />}
    </section>
  );
}
