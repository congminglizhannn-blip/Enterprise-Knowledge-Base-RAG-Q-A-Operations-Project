"use client";
import { Fragment } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { useAuth } from "@/features/auth/hooks";
import { mapBackendRole } from "@/features/auth/utils";
import { AppShell } from "@/components/layout/AppShell";
import type { BusinessView } from "@/lib/routing";
const titles: Record<BusinessView, string> = {"dashboard": "运营总览", "knowledge": "知识库", "ingestion": "文档入库", "chat": "知识库问答", "workflow": "流程图", "history": "问答历史", "admin": "系统管理", "account": "账号安全"};
export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const active = usePathname().split("/")[1] as BusinessView;
  return <AuthGate><AppShell active={active} title={titles[active] ?? "企业知识库"}
    onNavigate={(view) => router.push("/" + view)}
    role={auth.user ? mapBackendRole(auth.user.role) : "普通用户"}
    orgName={auth.org?.name ?? "未识别组织"} departmentName={auth.department?.name ?? "未识别部门"}
    userName={auth.user?.full_name || auth.user?.username || "当前用户"}
    onLogout={() => { void auth.logout().finally(() => router.replace("/login")); }}>
    {auth.error && <div className="notice-bar" role="alert">{auth.error}<button onClick={() => void auth.retry()}>重试验证</button></div>}
    <Fragment key={`${auth.user?.id}-${auth.user?.role}-${auth.user?.department_id}`}>{children}</Fragment>
  </AppShell></AuthGate>;
}
