"use client";

import React, { useEffect, useRef } from "react";
import { useAuth } from "./hooks";

type AuthGateProps = {
  children: React.ReactNode;
  onUnauthenticated?: () => void;
  onMustChangePassword?: () => void;
};

export function AuthGate({ children, onUnauthenticated, onMustChangePassword }: AuthGateProps) {
  const { status, mustChangePassword, retry, error } = useAuth();
  const onUnauthenticatedRef = useRef(onUnauthenticated);
  const onMustChangePasswordRef = useRef(onMustChangePassword);

  useEffect(() => {
    onUnauthenticatedRef.current = onUnauthenticated;
    onMustChangePasswordRef.current = onMustChangePassword;
  }, [onUnauthenticated, onMustChangePassword]);

  useEffect(() => {
    if (status === "unauthenticated") {
      onUnauthenticatedRef.current?.();
      return;
    }
    if (status === "authenticated" && mustChangePassword) {
      onMustChangePasswordRef.current?.();
    }
  }, [status, mustChangePassword]);

  if (status === "loading") {
    return <div className="auth-state">正在恢复登录态...</div>;
  }

  if (status === "error") {
    return (
      <div className="auth-state">
        <strong>加载失败</strong>
        <span>{error || "加载失败，请检查网络后重试。"}</span>
        <button className="primary-btn small" onClick={retry}>刷新重试</button>
      </div>
    );
  }

  if (status !== "authenticated" || mustChangePassword) {
    return null;
  }

  return <>{children}</>;
}
