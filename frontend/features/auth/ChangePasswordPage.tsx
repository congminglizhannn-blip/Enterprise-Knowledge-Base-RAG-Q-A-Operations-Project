"use client";

import React, { useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { ApiError } from "@/types/common";
import { useAuth } from "./hooks";

type ChangePasswordPageProps = {
  onPasswordChanged: () => void;
  onLogout: () => Promise<void>;
};

function isNetworkError(error: unknown) {
  return error instanceof ApiError && (error.status === 0 || error.code === "NETWORK_ERROR");
}

export function ChangePasswordPage({ onPasswordChanged, onLogout }: ChangePasswordPageProps) {
  const { changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit() {
    setMessage("");
    if (newPassword.length < 8) {
      setMessage("新密码至少需要 8 位。");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage("两次输入的新密码不一致。");
      return;
    }
    setIsSubmitting(true);
    try {
      await changePassword({ current_password: currentPassword, new_password: newPassword });
      onPasswordChanged();
    } catch (error) {
      setMessage(isNetworkError(error) ? "网络异常，无法提交改密请求，请检查连接后重试。" : "改密失败，请确认当前密码正确，或刷新后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="login-card register-card">
        <KeyRound className="login-mark" size={34} />
        <h2>修改密码</h2>
        <p>当前账号需要先完成密码更新，完成前不能进入业务工作台。</p>
        <label>当前密码<input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" /></label>
        <label>新密码<input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" /></label>
        <label>确认新密码<input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" /></label>
        <button className="primary-btn" disabled={isSubmitting} onClick={handleSubmit}>{isSubmitting ? "提交中..." : "确认修改"}</button>
        <button className="secondary-btn auth-link-btn" onClick={onLogout}><LogOut size={16} />退出登录</button>
        {message && <div className="form-error">{message}</div>}
      </section>
    </main>
  );
}
