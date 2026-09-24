export type ChatMessage = {
  role: string;
  content: string;
};

export type Citation = {
  document_id?: string | null;
  document_name: string;
  content_preview: string;
  chunk_id?: string;
  score?: number | null;
};

// CitationRow mirrors the current app/page.tsx citation payload during migration.
// Keep it separate from Citation until the ChatPage extraction is complete.
export type CitationRow = {
  document_id?: string | null;
  document_name: string;
  content_preview: string;
  chunk_id?: string;
  score?: number | null;
};

export type ChatSession = {
  id: string;
  title: string;
  knowledge_base_id: string;
  updated_at: string;
};

export type ChatSessionSummary = {
  qa_round_count: number;
  id: string;
  knowledge_base_id: string;
  title: string;
  updated_at: string;
};

export type ChatMetadata = {
  session_id?: string;
  citations?: Citation[];
  is_flow_question?: boolean;
};
