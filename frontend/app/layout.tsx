import type { Metadata } from "next";
import { AuthProvider } from "@/features/auth/AuthContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "企业知识库 RAG 问答系统",
  description: "企业内部知识库文档入库、权限检索和 RAG 流式问答前端",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
