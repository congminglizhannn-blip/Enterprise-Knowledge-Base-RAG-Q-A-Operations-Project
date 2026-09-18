import { Building2, LogOut, UsersRound } from "lucide-react";

type TopbarProps = {
  title: string;
  role: string;
  orgName: string;
  departmentName: string;
  userName: string;
  onLogout?: () => void;
};

export function Topbar({
  title,
  role,
  orgName,
  departmentName,
  userName,
  onLogout,
}: TopbarProps) {
  const isSuperAdmin = role === "超级管理员";
  const contextText = isSuperAdmin ? "全组织管理视角" : `${orgName} · ${departmentName}`;

  return (
    <header className="topbar">
      <div>
        <h2>{title}</h2>
        <span>{contextText}</span>
      </div>
      <div className="topbar-actions">
        {!isSuperAdmin && <span className="pill"><Building2 size={16} />{orgName}</span>}
        <span className="pill"><UsersRound size={16} />{userName} · {role}</span>
        {onLogout && <button className="icon-btn" onClick={onLogout} title="退出登录"><LogOut size={18} /></button>}
      </div>
    </header>
  );
}
