export type ID = string;

export type SortDirection = "asc" | "desc";

export type PageRequest = {
  page: number;
  pageSize: number;
};

export type PageResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type AuthenticatedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "CSRF_INVALID"
  | "NETWORK_ERROR"
  | "SERVER_ERROR"
  | string;

export type ApiErrorPayload = {
  code: ApiErrorCode;
  message: string;
  status?: number;
  details?: unknown;
};

export class ApiError extends Error {
  code: ApiErrorCode;
  status?: number;
  details?: unknown;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = "ApiError";
    this.code = payload.code;
    this.status = payload.status;
    this.details = payload.details;
  }
}
