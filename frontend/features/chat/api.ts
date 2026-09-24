import { apiJson } from "@/lib/apiClient";

import type { ChatSession } from "./types";

export type CreateChatSessionPayload = {
  knowledge_base_id: string;
  title?: string;
  question?: string;
};

export function listChatSessions(): Promise<ChatSession[]> {
  return apiJson<ChatSession[]>("/api/sessions?scope=mine");
}

export function getChatSession(id: string): Promise<ChatSession> {
  return apiJson<ChatSession>(`/api/sessions/${encodeURIComponent(id)}`);
}

export function createChatSession(payload: CreateChatSessionPayload): Promise<ChatSession> {
  return apiJson<ChatSession>("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteChatSession(id: string): Promise<void> {
  await apiJson<unknown>(`/api/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
