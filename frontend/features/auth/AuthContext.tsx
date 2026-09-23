"use client";

import React, { createContext, useCallback, useEffect, useMemo, useReducer } from "react";
import { ApiError } from "@/types/common";
import { clearCsrfToken, setOnUnauthenticated } from "@/lib/apiClient";
import * as authApi from "./api";
import type { AuthProfile, AuthStatus, ChangePasswordRequest, LoginResponse, RegisterRequest } from "./types";

type AuthState = AuthProfile & {
  status: AuthStatus;
  initializing: boolean;
  csrfReady: boolean;
  error: string | null;
  accessToken: string | null;
  isLoggingOut: boolean;
};

type AuthAction =
  | { type: "AUTH_LOADING" }
  | { type: "AUTH_SUCCESS"; payload: AuthProfile; accessToken?: string | null }
  | { type: "AUTH_UNAUTHENTICATED" }
  | { type: "AUTH_LOGGING_OUT" }
  | { type: "AUTH_LOGGED_OUT" }
  | { type: "AUTH_ERROR"; error: string }
  | { type: "CSRF_READY"; ready: boolean };

type AuthContextValue = AuthState & {
  mustChangePassword: boolean;
  login: (username: string, password: string) => Promise<LoginResponse>;
  register: (payload: RegisterRequest) => Promise<LoginResponse>;
  changePassword: (payload: ChangePasswordRequest) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  retry: () => Promise<void>;
  markUnauthenticated: () => void;
};

const initialState: AuthState = {
  status: "loading",
  initializing: true,
  csrfReady: false,
  error: null,
  accessToken: null,
  isLoggingOut: false,
  user: null as unknown as AuthProfile["user"],
  org: null as unknown as AuthProfile["org"],
  department: null as unknown as AuthProfile["department"],
};

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_RESTORE_TIMEOUT_MS = 5000;

function reducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "AUTH_LOADING":
      return { ...state, status: "loading", initializing: true, error: null };
    case "AUTH_SUCCESS":
      return {
        ...state,
        ...action.payload,
        status: "authenticated",
        initializing: false,
        error: null,
        accessToken: action.accessToken ?? state.accessToken,
        isLoggingOut: false,
      };
    case "AUTH_UNAUTHENTICATED":
      return {
        ...initialState,
        status: "unauthenticated",
        initializing: false,
      };
    case "AUTH_LOGGING_OUT":
      return { ...state, isLoggingOut: true };
    case "AUTH_LOGGED_OUT":
      return {
        ...initialState,
        status: "unauthenticated",
        initializing: false,
        isLoggingOut: false,
      };
    case "AUTH_ERROR":
      return { ...state, status: "error", initializing: false, error: action.error };
    case "CSRF_READY":
      return { ...state, csrfReady: action.ready };
    default:
      return state;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const markUnauthenticated = useCallback(() => {
    clearCsrfToken();
    dispatch({ type: "AUTH_UNAUTHENTICATED" });
  }, []);

  const prefetchCsrf = useCallback(async () => {
    dispatch({ type: "CSRF_READY", ready: false });
    try {
      await authApi.csrf();
      dispatch({ type: "CSRF_READY", ready: true });
    } catch {
      dispatch({ type: "CSRF_READY", ready: false });
    }
  }, []);

  const retry = useCallback(async () => {
    dispatch({ type: "AUTH_LOADING" });
    try {
      const profile = await withTimeout(authApi.me(), AUTH_RESTORE_TIMEOUT_MS);
      dispatch({ type: "AUTH_SUCCESS", payload: profile });
      void prefetchCsrf();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        markUnauthenticated();
        return;
      }
      const message = error instanceof AuthRestoreTimeoutError || (error instanceof ApiError && error.status === 0)
        ? "无法连接服务器，请检查网络后重试。"
        : "认证状态加载失败，请检查网络或稍后重试。";
      dispatch({ type: "AUTH_ERROR", error: message });
    }
  }, [markUnauthenticated, prefetchCsrf]);

  useEffect(() => {
    setOnUnauthenticated(markUnauthenticated);
    void retry();
    return () => setOnUnauthenticated(null);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const response = await authApi.login(username, password);
    clearCsrfToken();
    dispatch({ type: "AUTH_SUCCESS", payload: response, accessToken: response.access_token });
    void prefetchCsrf();
    return response;
  }, [prefetchCsrf]);

  const register = useCallback(async (payload: RegisterRequest) => {
    const response = await authApi.register(payload);
    clearCsrfToken();
    dispatch({ type: "AUTH_SUCCESS", payload: response, accessToken: response.access_token });
    void prefetchCsrf();
    return response;
  }, [prefetchCsrf]);

  const changePassword = useCallback(async (payload: ChangePasswordRequest) => {
    const response = await authApi.changePassword(payload);
    clearCsrfToken();
    dispatch({ type: "CSRF_READY", ready: false });
    dispatch({ type: "AUTH_SUCCESS", payload: response, accessToken: response.access_token });
    void prefetchCsrf();
    return response;
  }, [prefetchCsrf]);

  const logout = useCallback(async () => {
    dispatch({ type: "AUTH_LOGGING_OUT" });
    try {
      await authApi.logout();
    } catch {
      // Continue clearing local auth state even if the logout request fails.
    } finally {
      clearCsrfToken();
      dispatch({ type: "AUTH_LOGGED_OUT" });
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    ...state,
    mustChangePassword: state.user?.must_change_password ?? false,
    login,
    register,
    changePassword,
    logout,
    retry,
    markUnauthenticated,
  }), [changePassword, login, logout, markUnauthenticated, register, retry, state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { AuthContext };

class AuthRestoreTimeoutError extends Error {
  constructor() {
    super("Auth restore timed out");
    this.name = "AuthRestoreTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new AuthRestoreTimeoutError()), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}
