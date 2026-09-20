"use client";

import React, { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./hooks";

type AuthGateProps = {
  children: React.ReactNode;
  onUnauthenticated?: () => void;
  onMustChangePassword?: () => void;
};

export function AuthGate({ children, onUnauthenticated, onMustChangePassword }: AuthGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, mustChangePassword, retry, error } = useAuth();
  const onUnauthenticatedRef = useRef(onUnauthenticated);
  const onMustChangePasswordRef = useRef(onMustChangePassword);
  const fallbackRedirectRef = useRef<string | null>(null);

  useEffect(() => {
    onUnauthenticatedRef.current = onUnauthenticated;
    onMustChangePasswordRef.current = onMustChangePassword;
  }, [onUnauthenticated, onMustChangePassword]);

  useEffect(() => {
    if (status === "unauthenticated") {
      if (onUnauthenticatedRef.current) {
        fallbackRedirectRef.current = null;
        onUnauthenticatedRef.current();
        return;
      }
      const target = `/login?redirect=${encodeURIComponent(pathname)}`;
      if (fallbackRedirectRef.current !== target) {
        fallbackRedirectRef.current = target;
        router.replace(target);
      }
      return;
    }
    if (status === "authenticated" && mustChangePassword) {
      if (onMustChangePasswordRef.current) {
        fallbackRedirectRef.current = null;
        onMustChangePasswordRef.current();
        return;
      }
      if (fallbackRedirectRef.current !== "/change-password") {
        fallbackRedirectRef.current = "/change-password";
        router.replace("/change-password");
      }
      return;
    }
    fallbackRedirectRef.current = null;
  }, [status, mustChangePassword, pathname, router]);

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
