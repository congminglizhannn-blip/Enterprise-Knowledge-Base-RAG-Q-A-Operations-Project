"use client";

import React, { useEffect, useState } from "react";
import { Monitor, RefreshCw, Trash2 } from "lucide-react";
import { ApiError } from "@/types/common";
import { listAuthSessions, revokeAuthSession } from "./api";
import type { AuthSessionInfo } from "./types";

export function SessionsPanel() {
  const [sessions, setSessions] = useState<AuthSessionInfo[]>([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    try {
      setSessions(await listAuthSessions());
      setNotice("认证会话已同步。");
    } catch (error) {
      setNotice(error instanceof ApiError && (error.status === 0 || error.code === "NETWORK_ERROR") ? "网络异常，无法加载认证会话，请检查连接后重试。" : "认证会话加载失败，请确认登录态有效。");
    }
  }

  async function handleRevoke(session: AuthSessionInfo) {
    try {
      await revokeAuthSession(session.id);
      await refresh();
      setNotice(session.is_current ? "当前会话已撤销，请重新登录。" : "会话已撤销。");
    } catch (error) {
      setNotice(error instanceof ApiError && (error.status === 0 || error.code === "NETWORK_ERROR") ? "网络异常，无法撤销会话，请检查连接后重试。" : "撤销失败，只能撤销自己的认证会话。");
    }
  }

  return (
    <section className="card">
      <h3>个人认证会话</h3>
      <div className="invite-toolbar">
        <button className="secondary-btn" onClick={refresh}><RefreshCw size={16} />刷新会话</button>
      </div>
      {notice && <p className="muted-text">{notice}</p>}
      <div className="session-list-panel">
        {sessions.length === 0 ? (
          <div className="empty-table-state">
            <Monitor size={24} />
            <strong>暂无活跃会话</strong>
          </div>
        ) : sessions.map((session) => (
          <article className="auth-session-card" key={session.id}>
            <Monitor size={18} />
            <div>
              <strong>{session.is_current ? "当前设备" : "其他设备"}</strong>
              <span>{session.ip ?? "未知 IP"} · {new Date(session.updated_at).toLocaleString()}</span>
              <small>{session.user_agent ?? "未知客户端"}</small>
            </div>
            <button className="table-action" onClick={() => handleRevoke(session)}><Trash2 size={14} />撤销</button>
          </article>
        ))}
      </div>
    </section>
  );
}
