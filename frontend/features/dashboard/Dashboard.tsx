import {
  Activity,
  BookOpen,
  FileText,
  GitBranch,
  History,
  Layers3,
  MessageSquareText,
  UploadCloud,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import type { ChatSessionSummary } from "@/features/chat/types";
import type { KnowledgeBase, UploadRow } from "@/features/documents/types";

type DashboardProps = {
  onEnterChat: () => void;
  onEnterIngestion: () => void;
  onEnterWorkflow: () => void;
  onEnterHistory: () => void;
  kbs: KnowledgeBase[];
  documentRows: UploadRow[];
  chatSessions: ChatSessionSummary[];
};

export function Dashboard({
  onEnterChat,
  onEnterIngestion,
  onEnterWorkflow,
  onEnterHistory,
  kbs,
  documentRows,
  chatSessions,
}: DashboardProps) {
  const todayKey = new Date().toDateString();
  const todaySessionCount = chatSessions.filter(
    (session) => new Date(session.updated_at).toDateString() === todayKey,
  ).length;
  const totalChunks = documentRows.reduce((sum, row) => sum + row.chunks, 0);

  return (
    <section className="page-grid">
      <div className="stats-row">
        <Stat icon={BookOpen} label="知识库" value={String(kbs.length)} />
        <Stat icon={FileText} label="文档总数" value={String(documentRows.length)} />
        <Stat icon={Layers3} label="Chunk 数" value={String(totalChunks)} />
        <Stat icon={Activity} label="今日问答" value={String(todaySessionCount)} />
      </div>
      <div className="dashboard-flow-stack">
        <Card title="MVP 核心链路">
          <div className="timeline">
            {["上传文档", "解析并分块", "向量入库", "权限内检索", "SSE 流式回答"].map((item, index) => (
              <div className="timeline-item" key={item}>
                <span>{index + 1}</span>
                <strong>{item}</strong>
                <small>{index < 3 ? "入库流程" : "问答流程"}</small>
              </div>
            ))}
          </div>
        </Card>
        <Card title="快速入口">
          <div className="quick-actions">
            <button onClick={onEnterIngestion}><UploadCloud size={18} />上传文档</button>
            <button onClick={onEnterChat}><MessageSquareText size={18} />开始问答</button>
            <button onClick={onEnterWorkflow}><GitBranch size={18} />查看流程</button>
            <button onClick={onEnterHistory}><History size={18} />查看审计</button>
          </div>
        </Card>
      </div>
    </section>
  );
}
