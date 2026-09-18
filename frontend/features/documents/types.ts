export type KnowledgeBase = {
  id: string;
  name: string;
  scope?: "global" | "organization" | "department";
  targetId?: string | null;
  dept: string;
  docs: number;
  chunks: number;
  status: string;
  updated: string;
};

export type UploadRow = {
  id?: string;
  kbId: string;
  name: string;
  type: string;
  source: string;
  status: string;
  chunks: number;
  owner: string;
  time: string;
};

export type DocumentDetail = {
  id: string;
  file_name: string;
  file_type: string;
  status: string;
  chunk_count: number;
  error_message?: string | null;
  chunks: { id: string; chunk_index: number; content: string }[];
};

export type BackendKnowledgeBase = {
  id: string;
  name: string;
  description?: string | null;
  scope?: "global" | "organization" | "department";
  target_id?: string | null;
  org_id?: string;
  department_id: string;
  created_by?: string;
  org_name?: string | null;
  department_name?: string | null;
  target_name?: string | null;
  document_count?: number;
  chunk_count?: number;
};

export type OrganizationInfo = {
  id: string;
  name: string;
  created_at: string;
};

export type DepartmentInfo = {
  id: string;
  name: string;
  org_id: string;
  description?: string | null;
};

export type BackendDocument = {
  id: string;
  knowledge_base_id: string;
  file_name: string;
  file_type: string;
  status: string;
  chunk_count: number;
  uploaded_by: string;
  uploader_name?: string | null;
  created_at?: string;
};
