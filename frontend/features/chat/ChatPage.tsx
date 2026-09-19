import React, { useEffect, useRef, useState } from "react";

import { Card } from "@/components/ui/Card";
import { DocumentDetailModal } from "@/features/documents/DocumentDetailModal";
import type { DocumentDetail, KnowledgeBase } from "@/features/documents/types";
import { NETWORK_ERROR_MESSAGE, isOfflineNow, toFriendlyError } from "@/lib/errors";
import { ApiError, type AuthenticatedFetch } from "@/types/common";

import { CitationPanel } from "./CitationPanel";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { streamChat } from "./stream";
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
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  function abortCurrentStream() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

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
    abortCurrentStream();
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
    abortCurrentStream();
    const controller = new AbortController();
    abortRef.current = controller;
    setMessages((current) => [...current, { role: "user", content: trimmedQuestion }, { role: "assistant", content: "正在检索当前知识库..." }]);
    setCitations([]);
    setQuestion("");
    setIsRequesting(true);
    let answer = "";
    try {
      await streamChat({
        sessionId: activeSessionId ?? undefined,
        knowledgeBaseId: selectedKb.id,
        question: trimmedQuestion,
        signal: controller.signal,
        onMetadata: (metadata) => {
          if (metadata.session_id) setActiveSessionId(metadata.session_id);
          if (metadata.citations) setCitations(metadata.citations);
        },
        onDelta: (text) => {
          answer += text;
          setMessages((current) => current.map((msg, index) => index === current.length - 1 ? { ...msg, content: answer } : msg));
        },
        onDone: ({ sessionId, citations }) => {
          if (sessionId) setActiveSessionId(sessionId);
          setCitations(citations);
          void refreshSessions();
        },
        onError: (error) => {
          if (error instanceof ApiError && error.status === 401) {
            onUnauthorized();
            return;
          }
          setMessages((current) => current.map((msg, index) => index === current.length - 1 ? { ...msg, content: toFriendlyError(error, "问答失败，请确认后端服务、DeepSeek 配置和当前知识库解析状态。") } : msg));
        },
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized();
        return;
      }
      setMessages((current) => current.map((msg, index) => index === current.length - 1 ? { ...msg, content: toFriendlyError(error, "问答失败，请确认后端服务、DeepSeek 配置和当前知识库解析状态。") } : msg));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setIsRequesting(false);
    }
  }

  return (
    <section className="chat-layout">
      <aside className="chat-side">
        <label>当前知识库</label>
        <select
          value={selectedKb?.id ?? ""}
          disabled={availableKbs.length === 0}
          onChange={(event) => {
            abortCurrentStream();
            setSelectedKb(availableKbs.find((kb) => kb.id === event.target.value) ?? null);
          }}
        >
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
