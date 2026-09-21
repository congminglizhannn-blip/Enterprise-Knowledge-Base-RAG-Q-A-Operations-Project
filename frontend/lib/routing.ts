export type BusinessView = "dashboard" | "knowledge" | "ingestion" | "chat" | "workflow" | "history" | "admin" | "account";
export type View = BusinessView;

export const BUSINESS_VIEWS: readonly BusinessView[] = [
  "dashboard",
  "knowledge",
  "ingestion",
  "chat",
  "workflow",
  "history",
  "admin",
  "account",
];

export const ROUTED_VIEWS: ReadonlySet<BusinessView> = new Set(["chat", "ingestion"]);
export const STATIC_KNOWN_ROUTES: readonly string[] = ["/", "/login", "/register", "/change-password"];

export const KNOWN_ROUTES: readonly string[] = [
  ...STATIC_KNOWN_ROUTES,
  ...Array.from(ROUTED_VIEWS).map((view) => `/${view}`),
];

export function normalizeActiveView(active: string | undefined): BusinessView | null {
  if (!active) return null;

  const normalized = active.replace(/^\//, "").split("/")[0];
  return BUSINESS_VIEWS.includes(normalized as BusinessView)
    ? (normalized as BusinessView)
    : null;
}

export function validateRedirectUrl(
  rawRedirect: string | null | undefined,
  origin: string,
): string | null {
  if (!rawRedirect) return null;

  let url: URL;
  try {
    url = new URL(rawRedirect, origin);
  } catch {
    return null;
  }

  if (url.origin !== origin) return null;

  if (KNOWN_ROUTES.includes(url.pathname)) {
    return `${url.pathname}${url.search}${url.hash}`;
  }

  if (url.pathname === "/" && url.searchParams.has("view")) {
    const view = url.searchParams.get("view");
    if (
      view &&
      BUSINESS_VIEWS.includes(view as BusinessView) &&
      !ROUTED_VIEWS.has(view as BusinessView)
    ) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  }

  return null;
}
