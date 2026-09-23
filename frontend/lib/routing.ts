export type BusinessView =
  | "dashboard"
  | "knowledge"
  | "ingestion"
  | "chat"
  | "workflow"
  | "history"
  | "admin"
  | "account";

export const ROUTED_VIEWS: ReadonlySet<BusinessView> = new Set([
  "chat",
  "ingestion",
  "account",
  "workflow",
  "history",
  "dashboard",
  "admin",
  "knowledge",
]);
