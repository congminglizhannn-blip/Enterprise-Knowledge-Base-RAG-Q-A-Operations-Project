"use client";

import React, { createContext, useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { ApiError } from "@/types/common";
import { clearCsrfToken, clearReadCache, setOnUnauthenticated } from "@/lib/apiClient";
import * as authApi from "./api";
import type { AuthProfile, AuthStatus, ChangePasswordRequest, LoginResponse, RegisterRequest, Role } from "./types";

type AuthState = AuthProfile & {
  status: AuthStatus;
  initializing: boolean;
  revalidating: boolean;
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
  login: (username: string, password: string, role: Role) => Promise<LoginResponse>;
  register: (payload: RegisterRequest) => Promise<LoginResponse>;
  changePassword: (payload: ChangePasswordRequest) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  retry: () => Promise<void>;
  markUnauthenticated: () => void;
};

export const initialState: AuthState = {
  status: "loading",
  initializing: true,
  revalidating: false,
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

export function reducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "AUTH_LOADING":
      return { ...state, status: state.user ? "authenticated" : "loading", initializing: !state.user, revalidating: true, error: null };
    case "AUTH_SUCCESS":
      return {
        ...state,
        ...action.payload,
        status: "authenticated",
        initializing: false,
        revalidating: false,
        error: null,
        accessToken: action.accessToken ?? state.accessToken,
        isLoggingOut: false,
      };
    case "AUTH_UNAUTHENTICATED":
      return {
        ...initialState,
        status: "unauthenticated",
        initializing: false,
        revalidating: false,
      };
    case "AUTH_LOGGING_OUT":
      return { ...state, isLoggingOut: true };
    case "AUTH_LOGGED_OUT":
      return {
        ...initialState,
        status: "unauthenticated",
        initializing: false,
        revalidating: false,
        isLoggingOut: true,
      };
    case "AUTH_ERROR":
      return { ...state, status: state.user ? "authenticated" : "error", initializing: false,
        revalidating: false, error: action.error };
    case "CSRF_READY":
      return { ...state, csrfReady: action.ready };
    default:
      return state;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const generation = useRef(0);
  const pending = useRef<Promise<void> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const cancelRestore = useCallback(() => {
    clearReadCache();
    generation.current += 1;
    controller.current?.abort();
    pending.current = null;
  }, []);

  const markUnauthenticated = useCallback(() => {
    cancelRestore();
    clearCsrfToken();
    dispatch({ type: "AUTH_UNAUTHENTICATED" });
  }, [cancelRestore]);

  const prefetchCsrf = useCallback(async () => {
    dispatch({ type: "CSRF_READY", ready: false });
    try {
      await authApi.csrf();
      dispatch({ type: "CSRF_READY", ready: true });
    } catch {
      dispatch({ type: "CSRF_READY", ready: false });
    }
  }, []);

  const retry = useCallback((): Promise<void> => {
    if (pending.current) return pending.current;
    const version = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    dispatch({ type: "AUTH_LOADING" });
    const timer = window.setTimeout(() => abort.abort(), AUTH_RESTORE_TIMEOUT_MS);
    const task = (async () => {
      try {
        const profile = await authApi.me(abort.signal);
        if (version !== generation.current) return;
        clearReadCache();
        dispatch({ type: "AUTH_SUCCESS", payload: profile });
        void prefetchCsrf();
      } catch (error) {
        if (version !== generation.current) return;
        if (error instanceof ApiError && error.status === 401) {
          markUnauthenticated();
          return;
        }
        dispatch({ type: "AUTH_ERROR", error: "登录状态验证失败，请检查网络后重试。" });
      } finally {
        window.clearTimeout(timer);
        if (version === generation.current) pending.current = null;
      }
    })();
    pending.current = task;
    return task;
  }, [markUnauthenticated, prefetchCsrf]);

  useEffect(() => {
    setOnUnauthenticated(markUnauthenticated);
    void retry();
    return () => { setOnUnauthenticated(null); cancelRestore(); };
  }, [markUnauthenticated, retry, cancelRestore]);

  const login = useCallback(async (username: string, password: string, role: Role) => {
    cancelRestore();
    const response = await authApi.login(username, password, role);
    clearCsrfToken();
    dispatch({ type: "AUTH_SUCCESS", payload: response, accessToken: response.access_token });
    void prefetchCsrf();
    return response;
  }, [prefetchCsrf, cancelRestore]);

  const register = useCallback(async (payload: RegisterRequest) => {
    cancelRestore();
    const response = await authApi.register(payload);
    clearCsrfToken();
    dispatch({ type: "AUTH_SUCCESS", payload: response, accessToken: response.access_token });
    void prefetchCsrf();
    return response;
  }, [prefetchCsrf, cancelRestore]);

  const changePassword = useCallback(async (payload: ChangePasswordRequest) => {
    cancelRestore();
    const response = await authApi.changePassword(payload);
    clearCsrfToken();
    dispatch({ type: "CSRF_READY", ready: false });
    dispatch({ type: "AUTH_SUCCESS", payload: response, accessToken: response.access_token });
    void prefetchCsrf();
    return response;
  }, [prefetchCsrf, cancelRestore]);

  const logout = useCallback(async () => {
    cancelRestore();
    dispatch({ type: "AUTH_LOGGING_OUT" });
    try {
      await authApi.logout();
    } catch {
      // Continue clearing local auth state even if the logout request fails.
    } finally {
      cancelRestore();
      clearCsrfToken();
      dispatch({ type: "AUTH_LOGGED_OUT" });
    }
  }, [cancelRestore]);

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
