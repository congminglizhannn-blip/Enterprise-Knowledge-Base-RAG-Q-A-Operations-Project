"use client";

import React, { useState } from "react";
import { Eye, EyeOff, Layers3, LockKeyhole, MessageSquareText, ShieldCheck, UploadCloud } from "lucide-react";

type LoginPageProps = {
  onAuthenticated: (username: string, password: string) => Promise<void>;
  onGoRegister: () => void;
  role: string;
  setRole: (role: "超级管理员" | "部门管理员" | "普通用户") => void;
  loginError: string;
};

export function LoginPage({ onAuthenticated, onGoRegister, role, setRole, loginError }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="login-screen">
      <section className="login-hero">
        <div className="eyebrow">Enterprise Knowledge Base</div>
        <h1>企业知识库 RAG 问答系统</h1>
        <p>面向企业内部制度、流程、项目资料的智能检索问答平台，支持部门强隔离、文档入库、引用溯源和流式回答。</p>
        <div className="flow-strip">
          {[
            ["上传资料", UploadCloud],
            ["解析分块", Layers3],
            ["权限检索", ShieldCheck],
            ["流式问答", MessageSquareText],
          ].map(([label, Icon]) => (
            <div className="flow-step" key={label as string}>
              <Icon size={22} />
              <span>{label as string}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="login-card">
        <LockKeyhole className="login-mark" size={34} />
        <h2>登录工作台</h2>
        <p>请输入账号密码，并选择账号对应的角色。</p>
        <label>
          账号
          <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="请输入账号" />
        </label>
        <label>
          密码
          <div style={{ position: "relative" }}>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={showPassword ? "text" : "password"}
              placeholder="请输入对应密码"
              style={{ width: "100%", paddingRight: 48 }}
            />
            <button
              type="button"
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
              onClick={() => setShowPassword((visible) => !visible)}
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                border: 0,
                background: "transparent",
                color: "#64748b",
                cursor: "pointer",
                padding: 4,
              }}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </label>
        <label>
          登录角色
          <select value={role} onChange={(event) => setRole(event.target.value as "超级管理员" | "部门管理员" | "普通用户")}>
            <option>超级管理员</option>
            <option>部门管理员</option>
            <option>普通用户</option>
          </select>
        </label>
        <button className="primary-btn" onClick={() => onAuthenticated(username, password)}>登录</button>
        <button className="secondary-btn auth-link-btn" onClick={onGoRegister}>注册新账号</button>
        {loginError && <div className="form-error">{loginError}</div>}
        <small>真实密钥和企业凭据仅通过环境变量配置，前端不保存敏感信息。</small>
      </section>
    </main>
  );
}
