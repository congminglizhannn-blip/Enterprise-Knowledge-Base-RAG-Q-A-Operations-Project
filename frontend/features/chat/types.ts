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

export type ChatSession = {
  id: string;
  title: string;
  knowledge_base_id: string;
  updated_at: string;
};

export type ChatMetadata = {
  session_id?: string;
  citations?: Citation[];
  is_flow_question?: boolean;
};
