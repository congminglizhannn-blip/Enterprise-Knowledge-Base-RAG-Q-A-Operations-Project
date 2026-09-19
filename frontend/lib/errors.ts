import { ApiError } from "@/types/common";

export const NETWORK_ERROR_MESSAGE = "网络异常，无法连接服务器，请检查连接后重试。";

export function isNetworkError(error: unknown) {
  return error instanceof ApiError && (error.status === 0 || error.code === "NETWORK_ERROR");
}

export function isOfflineNow() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function toFriendlyError(error: unknown, fallback: string) {
  if (isNetworkError(error)) return NETWORK_ERROR_MESSAGE;
  if (error instanceof ApiError && error.message) return error.message;
  return fallback;
}
