import { streamFetch as openChatStream } from "@/lib/apiClient";
import { ApiError } from "@/types/common";

import type { ChatMetadata, Citation } from "./types";

export type StreamChatParams = {
  sessionId?: string;
  knowledgeBaseId: string;
  question: string;
  onMetadata: (metadata: ChatMetadata) => void;
  onDelta: (text: string) => void;
  onDone: (result: { sessionId: string; citations: Citation[] }) => void;
  onError: (error: ApiError) => void;
  signal?: AbortSignal;
};

type RawStreamEvent = {
  eventType?: string;
  data: string;
};

function normalizeApiError(error: unknown, fallbackMessage: string): ApiError {
  if (error instanceof ApiError) return error;

  return new ApiError({
    code: "CHAT_STREAM_ERROR",
    message: fallbackMessage,
    status: 0,
    details: error,
  });
}

function parseJsonPayload<T>(data: string, eventType: string): T {
  try {
    return JSON.parse(data) as T;
  } catch (error) {
    throw new ApiError({
      code: "CHAT_STREAM_PARSE_ERROR",
      message: `无法解析 ${eventType} 事件。`,
      status: 0,
      details: error,
    });
  }
}

function parseStreamBlock(block: string): RawStreamEvent | null {
  const normalizedBlock = block.replace(/\r\n/g, "\n").trim();
  if (!normalizedBlock) return null;

  const eventType = normalizedBlock.match(/^event:\s*(.+)$/m)?.[1]?.trim();
  const dataLines = normalizedBlock
    .split("\n")
    .filter((line) => line.startsWith("data:"));
  const data = dataLines.map((line) => line.replace(/^data:\s?/, "")).join("\n");

  if (!data) return null;
  return { eventType, data };
}

function toDoneResult(data: string): { sessionId: string; citations: Citation[] } {
  const parsed = parseJsonPayload<{
    session_id?: string;
    sessionId?: string;
    citations?: Citation[];
  }>(data, "done");

  return {
    sessionId: parsed.session_id ?? parsed.sessionId ?? "",
    citations: parsed.citations ?? [],
  };
}

function toErrorEvent(data: string): ApiError {
  const parsed = parseJsonPayload<{
    code?: string;
    message?: string;
    status?: number;
    details?: unknown;
  }>(data, "error");

  return new ApiError({
    code: parsed.code ?? "CHAT_STREAM_ERROR",
    message: parsed.message ?? "流式回答失败。",
    status: parsed.status ?? 0,
    details: parsed.details,
  });
}

export async function streamChat(params: StreamChatParams): Promise<void> {
  const {
    sessionId,
    knowledgeBaseId,
    question,
    onMetadata,
    onDelta,
    onDone,
    onError,
    signal,
  } = params;

  let receivedDone = false;

  try {
    const response = await openChatStream("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        knowledge_base_id: knowledgeBaseId,
        question,
        session_id: sessionId,
      }),
      signal,
    });

    if (signal?.aborted) return;
    if (!response.body) {
      throw new ApiError({
        code: "CHAT_STREAM_EMPTY_BODY",
        message: "流式回答没有返回内容。",
        status: response.status,
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const handleBlock = (block: string) => {
      const parsed = parseStreamBlock(block);
      if (!parsed) return;

      if (parsed.eventType === "metadata") {
        onMetadata(parseJsonPayload<ChatMetadata>(parsed.data, "metadata"));
        return;
      }

      if (parsed.eventType === "delta") {
        onDelta(parsed.data);
        return;
      }

      if (parsed.eventType === "done") {
        receivedDone = true;
        onDone(toDoneResult(parsed.data));
        return;
      }

      if (parsed.eventType === "error") {
        throw toErrorEvent(parsed.data);
      }
    };

    try {
      while (true) {
        if (signal?.aborted) return;

        const { value, done } = await reader.read();
        if (done) {
          if (buffer.trim()) handleBlock(buffer);
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? "";
        blocks.forEach(handleBlock);
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // The stream may already be closed or released.
      }
    }

    if (!receivedDone && !signal?.aborted) {
      throw new ApiError({
        code: "CHAT_STREAM_INCOMPLETE",
        message: "流式回答异常结束，请重试。",
        status: 0,
      });
    }
  } catch (error) {
    if (signal?.aborted) return;
    onError(normalizeApiError(error, "流式回答失败。"));
  }
}
