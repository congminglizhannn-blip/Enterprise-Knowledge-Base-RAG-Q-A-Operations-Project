import { apiJson } from "@/lib/apiClient";
import { historyParams } from "./historyQuery";
import type { HistoryOptions, HistoryQuery, HistoryResult, HistoryRole } from "./historyTypes";

export function fetchHistory(query: HistoryQuery, role: HistoryRole, signal?: AbortSignal) {
  return apiJson<HistoryResult>(`/api/qa-history?${historyParams(query, role)}`, { signal });
}
export function fetchHistoryOptions(orgId: string, signal?: AbortSignal) {
  return apiJson<HistoryOptions>(`/api/qa-history/filter-options${orgId ? `?org_id=${encodeURIComponent(orgId)}` : ""}`, { signal });
}
