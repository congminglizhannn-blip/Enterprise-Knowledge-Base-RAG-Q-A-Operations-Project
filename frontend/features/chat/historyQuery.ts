import type { HistoryQuery, HistoryRole } from "./historyTypes";

export const defaultHistoryQuery: HistoryQuery = {
  keyword: "", org_id: "", dept_id: "", kb_id: "", user_id: "", start_time: "", end_time: "",
  sort_by: "updated_at", sort_order: "desc", page: 1, page_size: 20,
};
export function updateHistoryQuery(query: HistoryQuery, patch: Partial<HistoryQuery>): HistoryQuery {
  return { ...query, ...patch, ...(patch.org_id !== undefined && patch.org_id !== query.org_id ? { dept_id: "" } : {}), page: patch.page ?? 1 };
}
export function sortHistory(query: HistoryQuery, column: HistoryQuery["sort_by"]): HistoryQuery {
  return { ...query, sort_by: column, sort_order: query.sort_by === column && query.sort_order === "desc" ? "asc" : "desc", page: 1 };
}
export function historyParams(query: HistoryQuery, role: HistoryRole): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === "") continue;
    if ((key === "org_id" || key === "dept_id") && role !== "super_admin") continue;
    if (key === "user_id" && role === "user") continue;
    params.set(key, key === "start_time" || key === "end_time" ? new Date(value).toISOString() : String(value));
  }
  return params;
}
