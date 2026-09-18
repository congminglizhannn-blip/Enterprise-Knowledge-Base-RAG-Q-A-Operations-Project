import {
  BookOpen,
  Database,
  GitBranch,
  History,
  Home,
  MessageSquareText,
  Settings,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";

type SidebarProps<View extends string> = {
  active: View;
  onNavigate: (view: View) => void;
};

export function Sidebar<View extends string>({ active, onNavigate }: SidebarProps<View>) {
  const items = [
    ["chat", MessageSquareText, "问答工作台"],
    ["dashboard", Home, "运营总览"],
    ["knowledge", BookOpen, "知识库"],
    ["ingestion", UploadCloud, "文档入库"],
    ["workflow", GitBranch, "流程图"],
    ["history", History, "问答历史"],
    ["admin", Settings, "系统管理"],
    ["account", ShieldCheck, "账号安全"],
  ] as const;

  return (
    <aside className="sidebar">
      <div className="brand">
        <Database size={28} />
        <div>
          <strong>企业知识库</strong>
          <span>RAG Operations</span>
        </div>
      </div>
      <nav>
        {items.map(([key, Icon, label]) => (
          <button className={active === key ? "active" : ""} key={key} onClick={() => onNavigate(key as View)}>
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>
      <div className="sidebar-note">
        <ShieldCheck size={18} />
        SQL 层部门强隔离
      </div>
    </aside>
  );
}
