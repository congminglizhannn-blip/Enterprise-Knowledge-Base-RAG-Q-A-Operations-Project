import React from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

type AppShellProps<View extends string> = {
  active: View;
  onNavigate: (view: View) => void;
  title: string;
  role: string;
  orgName: string;
  departmentName: string;
  userName: string;
  onLogout?: () => void;
  notice?: string;
  children: React.ReactNode;
};

export function AppShell<View extends string>({
  active,
  onNavigate,
  title,
  role,
  orgName,
  departmentName,
  userName,
  onLogout,
  notice,
  children,
}: AppShellProps<View>) {
  return (
    <div className="app-shell">
      <Sidebar active={active} onNavigate={onNavigate} />
      <main className="main-panel">
        <Topbar
          title={title}
          role={role}
          orgName={orgName}
          departmentName={departmentName}
          userName={userName}
          onLogout={onLogout}
        />
        {notice && <div className="notice-bar">{notice}</div>}
        {children}
      </main>
    </div>
  );
}
