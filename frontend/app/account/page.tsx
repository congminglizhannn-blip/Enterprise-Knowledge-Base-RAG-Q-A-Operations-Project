"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGate } from "@/features/auth/AuthGate";
import { SessionsPanel } from "@/features/auth/SessionsPanel";
import { useAuth } from "@/features/auth/hooks";
import type { Role } from "@/features/auth/types";
import { mapBackendRole } from "@/features/auth/utils";
import { ROUTED_VIEWS, type BusinessView } from "@/lib/routing";

function AccountPageContent() {
  const router = useRouter();
  const auth = useAuth();
  const role: Role = auth.user ? mapBackendRole(auth.user.role) : "普通用户";

  const handleNavigate = useCallback((view: BusinessView) => {
    if (ROUTED_VIEWS.has(view)) {
      router.push("/" + view);
    } else {
      router.push("/?view=" + view);
    }
  }, [router]);

  const handleLogout = useCallback(async () => {
    router.replace("/login");
    await auth.logout().catch(() => {});
  }, [auth, router]);

  return (
    <AuthGate>
      <AppShell
        active="account"
        onNavigate={handleNavigate}
        title="账号安全"
        role={role}
        orgName={auth.org?.name ?? "未识别组织"}
        departmentName={auth.department?.name ?? "未识别部门"}
        userName={auth.user?.full_name || auth.user?.username || "当前用户"}
        onLogout={handleLogout}
      >
        <SessionsPanel />
      </AppShell>
    </AuthGate>
  );
}

export default function AccountRoute() {
  return <AccountPageContent />;
}
