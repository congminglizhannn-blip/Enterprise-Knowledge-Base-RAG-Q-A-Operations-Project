"use client";

import { ChevronDown, Search } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import type { ChatMessage, ChatSessionSummary } from "./types";

export type HistoryPageProps = {
  sessions: ChatSessionSummary[];
  messages: ChatMessage[];
  setNotice: (notice: string) => void;
};

function formatTime(value?: string) {
  if (!value) return "实时数据";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function HistoryPage({ sessions, messages, setNotice }: HistoryPageProps) {
  return (
    <section className="content-stack">
      <div className="section-toolbar">
        <div className="search-box"><Search size={18} /><input placeholder="按问题、用户、知识库搜索" /></div>
        <button className="secondary-btn" onClick={() => setNotice("当前 MVP 仅展示登录用户所属部门数据，后续会接入多部门筛选。")}><ChevronDown size={16} />产品运营部</button>
      </div>
      <Card title="问答历史与审计">
        <DataTable
          headers={["会话标题", "知识库ID", "更新时间", "当前载入消息数"]}
          rows={sessions.length > 0
            ? sessions.map((session) => [session.title, session.knowledge_base_id, formatTime(session.updated_at), String(messages.length)])
            : [["暂无历史会话", "-", "-", "0"]]}
        />
      </Card>
    </section>
  );
}
