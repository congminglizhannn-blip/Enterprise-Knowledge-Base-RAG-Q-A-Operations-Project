"use client";

import React, { useEffect, useState } from "react";
import { Copy, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createInvite, listInvites, revokeInvite } from "@/features/auth/api";
import type { InviteInfo, InviteRole } from "@/features/auth/types";

type InvitePageProps = {
  enabled: boolean;
};

const roleLabels: Record<InviteRole, string> = {
  super_admin: "超级管理员",
  dept_admin: "部门管理员",
  user: "普通用户",
};

export function InvitePage({ enabled }: InvitePageProps) {
  const [invites, setInvites] = useState<InviteInfo[]>([]);
  const [role, setRole] = useState<InviteRole>("user");
  const [lastInviteCode, setLastInviteCode] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled]);

  if (!enabled) return null;

  async function refresh() {
    try {
      setInvites(await listInvites());
      setNotice("邀请码列表已同步。");
    } catch {
      setNotice("邀请码列表加载失败，请确认当前账号权限。");
    }
  }

  async function handleCreate() {
    try {
      const invite = await createInvite({ role, expires_in_days: 7 });
      setLastInviteCode(invite.invite_code);
      await refresh();
      setNotice("邀请码已生成，仅展示一次。");
    } catch {
      setNotice("邀请码创建失败，请确认 CSRF 状态和超级管理员权限。");
    }
  }

  async function handleRevoke(inviteId: string) {
    try {
      await revokeInvite(inviteId);
      await refresh();
      setNotice("邀请码已撤销。");
    } catch {
      setNotice("撤销失败，请确认邀请码仍属于当前组织。");
    }
  }

  return (
    <Card title="邀请码管理">
      <div className="invite-toolbar">
        <select value={role} onChange={(event) => setRole(event.target.value as InviteRole)}>
          <option value="user">普通用户</option>
          <option value="dept_admin">部门管理员</option>
          <option value="super_admin">超级管理员</option>
        </select>
        <button className="secondary-btn" onClick={refresh}><RefreshCw size={16} />刷新</button>
        <button className="primary-btn small" onClick={handleCreate}><ShieldCheck size={16} />生成邀请码</button>
      </div>
      {lastInviteCode && (
        <div className="invite-code-box">
          <strong>{lastInviteCode}</strong>
          <button className="table-action" onClick={() => navigator.clipboard?.writeText(lastInviteCode)}><Copy size={14} />复制</button>
        </div>
      )}
      {notice && <p className="muted-text">{notice}</p>}
      <div className="table-wrap invite-table">
        <table>
          <thead><tr><th>角色</th><th>状态</th><th>过期时间</th><th>操作</th></tr></thead>
          <tbody>
            {invites.length === 0 ? (
              <tr><td colSpan={4}>暂无邀请码</td></tr>
            ) : invites.map((invite) => (
              <tr key={invite.id}>
                <td>{roleLabels[invite.role]}</td>
                <td>{invite.revoked_at ? "已撤销" : invite.used_at ? "已使用" : "可使用"}</td>
                <td>{new Date(invite.expires_at).toLocaleString()}</td>
                <td><button className="table-action" disabled={Boolean(invite.revoked_at || invite.used_at)} onClick={() => handleRevoke(invite.id)}><Trash2 size={14} />撤销</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
