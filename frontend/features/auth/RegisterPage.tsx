"use client";

import React, { useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { ApiError } from "@/types/common";
import { listOrganizations } from "./api";
import type { OrganizationInfo, RegisterRequest } from "./types";

type RegisterPageProps = {
  onAuthenticated: (payload: RegisterRequest) => Promise<void>;
  onBackToLogin: () => void;
  registerError: string;
};

function isNetworkError(error: unknown) {
  return error instanceof ApiError && (error.status === 0 || error.code === "NETWORK_ERROR");
}

export function RegisterPage({ onAuthenticated, onBackToLogin, registerError }: RegisterPageProps) {
  const [mode, setMode] = useState<"organization" | "invite">("organization");
  const [organizations, setOrganizations] = useState<OrganizationInfo[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [orgNotice, setOrgNotice] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  useEffect(() => {
    void refreshOrganizations();
  }, []);

  async function refreshOrganizations() {
    try {
      const rows = await listOrganizations();
      setOrganizations(rows);
      setSelectedOrgId((current) => current || rows[0]?.id || "");
      setOrgNotice(rows.length === 0 ? "当前暂无可注册组织，请联系超级管理员先创建组织。" : "");
    } catch (error) {
      setOrgNotice(isNetworkError(error) ? "网络异常，无法加载组织列表，请检查连接后重试。" : "组织列表加载失败，请确认后端服务已启动。");
    }
  }

  const payload: RegisterRequest = {
    username,
    password,
    full_name: fullName || undefined,
    email: email || undefined,
    invite_code: mode === "invite" ? inviteCode || undefined : undefined,
    org_id: mode === "organization" ? selectedOrgId || undefined : undefined,
  };

  return (
    <main className="login-screen">
      <section className="login-card register-card">
        <LockKeyhole className="login-mark" size={34} />
        <h2>注册工作台</h2>
        <p>选择已有组织注册，或使用管理员提供的邀请码加入指定组织/部门。</p>
        <div className="mode-switch">
          <button className={mode === "organization" ? "active" : ""} onClick={() => setMode("organization")}>选择组织</button>
          <button className={mode === "invite" ? "active" : ""} onClick={() => setMode("invite")}>邀请码加入</button>
        </div>
        <label>用户名<input value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <label>密码<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" /></label>
        <label>姓名<input value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
        <label>邮箱<input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        {mode === "invite" ? (
          <label>邀请码<input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} /></label>
        ) : (
          <label>
            所属组织
            <select value={selectedOrgId} onChange={(event) => setSelectedOrgId(event.target.value)}>
              {organizations.length === 0 && <option value="">暂无可注册组织</option>}
              {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          </label>
        )}
        {orgNotice && <div className="form-error compact">{orgNotice}</div>}
        <button className="primary-btn" disabled={mode === "organization" && !selectedOrgId} onClick={() => onAuthenticated(payload)}>注册并进入</button>
        <button className="secondary-btn auth-link-btn" onClick={onBackToLogin}>返回登录</button>
        {registerError && <div className="form-error">{registerError}</div>}
      </section>
    </main>
  );
}
