import { ApiError, type ApiErrorPayload } from "@/types/common";

const isBrowser = typeof window !== "undefined";
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
const CSRF_HEADER = "X-CSRF-Token";
const JSON_CONTENT_TYPE = "application/json";

type ApiRequestInit = RequestInit & {
  skipAuthRedirect?: boolean;
  skipCsrf?: boolean;
  retryOnCsrfInvalid?: boolean;
};

type AuthStateHandler = () => void;

let csrfToken: string | null = isBrowser ? null : null;
let csrfRefreshPromise: Promise<void> | null = null;
let logoutPromise: Promise<void> | null = null;
let onUnauthenticated: AuthStateHandler | null = null;

export function setOnUnauthenticated(fn: AuthStateHandler | null) {
  onUnauthenticated = fn;
}

export function clearCsrfToken() {
  csrfToken = null;
}

export function __resetApiClientStateForDev() {
  if (process.env.NODE_ENV === "development" && isBrowser) {
    csrfToken = null;
    csrfRefreshPromise = null;
    logoutPromise = null;
    // onUnauthenticated is registered by AuthContext and must survive dev-only resets/HMR.
  }
}

function assertBrowser(operation: string) {
  if (!isBrowser) {
    throw new Error(`${operation} is only allowed in the browser environment.`);
  }
}

function resolveApiUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input !== "string") return input;
  if (!input.startsWith("/")) return input;

  return `${API_BASE}${input}`;
}

function needsCsrf(method: string | undefined) {
  const normalizedMethod = (method ?? "GET").toUpperCase();
  return ["POST", "PUT", "PATCH", "DELETE"].includes(normalizedMethod);
}

function mergeHeaders(initHeaders: HeadersInit | undefined) {
  return new Headers(initHeaders);
}

async function parseErrorPayload(response: Response): Promise<ApiErrorPayload> {
  const fallback: ApiErrorPayload = {
    code: response.status === 401 ? "UNAUTHORIZED" : "SERVER_ERROR",
    message: response.statusText || "请求失败",
    status: response.status,
  };

  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes(JSON_CONTENT_TYPE)) {
      const body = await response.json();
      const detail = typeof body.detail === "object" && body.detail !== null ? body.detail : null;
      return {
        code: body.code ?? body.error_code ?? detail?.code ?? fallback.code,
        message: body.message ?? detail?.message ?? (typeof body.detail === "string" ? body.detail : fallback.message),
        status: response.status,
        details: body.details ?? body,
      };
    }

    const text = await response.text();
    return {
      ...fallback,
      message: text || fallback.message,
    };
  } catch {
    return fallback;
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  return new ApiError(await parseErrorPayload(response));
}

async function fetchWithNetworkError(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new ApiError({
        code: "NETWORK_ERROR",
        message: "无法连接到服务器，请检查网络",
        status: 0,
      });
    }
    throw error;
  }
}

function notifyUnauthenticated(options: ApiRequestInit) {
  if (!options.skipAuthRedirect) {
    onUnauthenticated?.();
  }
}

async function handleNonOkResponse(response: Response, options: ApiRequestInit): Promise<never> {
  const error = await toApiError(response);
  if (response.status === 401) {
    notifyUnauthenticated(options);
  }
  throw error;
}

export async function ensureCsrfToken(): Promise<void> {
  assertBrowser("ensureCsrfToken");
  if (csrfToken) return;
  if (csrfRefreshPromise) return csrfRefreshPromise;

  csrfRefreshPromise = (async () => {
    const response = await fetchWithNetworkError(resolveApiUrl("/api/auth/csrf"), {
      credentials: "include",
      headers: {
        Accept: JSON_CONTENT_TYPE,
      },
    });

    if (!response.ok) {
      clearCsrfToken();
      await handleNonOkResponse(response, { skipAuthRedirect: true });
    }

    const data = await response.json();
    csrfToken = data.csrf_token ?? null;
    if (!csrfToken) {
      throw new ApiError({
        code: "CSRF_INVALID",
        message: "未获取到 CSRF Token",
        status: response.status,
      });
    }
  })();

  try {
    return await csrfRefreshPromise;
  } finally {
    csrfRefreshPromise = null;
  }
}

async function withCsrf(init: ApiRequestInit): Promise<RequestInit> {
  const headers = mergeHeaders(init.headers);
  const methodNeedsCsrf = needsCsrf(init.method);

  if (methodNeedsCsrf && !init.skipCsrf) {
    await ensureCsrfToken();
    if (csrfToken) headers.set(CSRF_HEADER, csrfToken);
  }

  const { skipAuthRedirect, skipCsrf, retryOnCsrfInvalid, ...requestInit } = init;
  void skipAuthRedirect;
  void skipCsrf;
  void retryOnCsrfInvalid;

  return {
    ...requestInit,
    credentials: requestInit.credentials ?? "include",
    headers,
  };
}

export async function apiFetch(input: RequestInfo | URL, init: ApiRequestInit = {}): Promise<Response> {
  assertBrowser("apiFetch");
  const shouldRetryOnCsrfInvalid = init.retryOnCsrfInvalid ?? true;
  const response = await fetchWithNetworkError(resolveApiUrl(input), await withCsrf(init));

  if (
    shouldRetryOnCsrfInvalid &&
    response.status === 403 &&
    needsCsrf(init.method) &&
    !init.skipCsrf
  ) {
    const error = await toApiError(response);
    if (error.code === "CSRF_INVALID") {
      clearCsrfToken();
      await ensureCsrfToken();
      const retryResponse = await fetchWithNetworkError(resolveApiUrl(input), await withCsrf({
        ...init,
        retryOnCsrfInvalid: false,
      }));
      if (!retryResponse.ok) {
        await handleNonOkResponse(retryResponse, init);
      }
      return retryResponse;
    }
    throw error;
  }

  if (!response.ok) {
    await handleNonOkResponse(response, init);
  }

  return response;
}

export async function apiJson<T>(input: RequestInfo | URL, init: ApiRequestInit = {}): Promise<T> {
  const response = await apiFetch(input, init);
  return response.json() as Promise<T>;
}

export async function streamFetch(input: RequestInfo | URL, init: ApiRequestInit = {}): Promise<Response> {
  assertBrowser("streamFetch");
  const response = await fetchWithNetworkError(resolveApiUrl(input), await withCsrf({
    ...init,
    retryOnCsrfInvalid: false,
  }));

  if (!response.ok) {
    await handleNonOkResponse(response, init);
  }

  return response;
}

export async function logout(): Promise<void> {
  assertBrowser("logout");
  if (logoutPromise) return logoutPromise;

  logoutPromise = (async () => {
    try {
      await apiFetch("/api/auth/logout", {
        method: "POST",
        skipCsrf: true,
        retryOnCsrfInvalid: false,
      });
    } finally {
      clearCsrfToken();
      logoutPromise = null;
    }
  })();

  return logoutPromise;
}
