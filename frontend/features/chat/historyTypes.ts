export type HistoryRole = "super_admin" | "dept_admin" | "user";
export type HistoryQuery = {
  keyword: string; org_id: string; dept_id: string; kb_id: string; user_id: string;
  start_time: string; end_time: string; sort_by: "updated_at" | "round_count";
  sort_order: "asc" | "desc"; page: number; page_size: number;
};
export type HistoryItem = {
  id: string; title: string; user_id: string; user_name: string;
  org_id: string; org_name: string; dept_id: string; dept_name: string;
  kb_id: string; kb_name: string; round_count: number; created_at: string; updated_at: string;
};
export type HistoryResult = { items: HistoryItem[]; total: number; page: number; page_size: number };
export type HistoryOption = { id: string; name: string; org_id?: string | null; department_id?: string | null };
export type HistoryOptions = { organizations: HistoryOption[]; departments: HistoryOption[]; knowledge_bases: HistoryOption[]; users: HistoryOption[] };
