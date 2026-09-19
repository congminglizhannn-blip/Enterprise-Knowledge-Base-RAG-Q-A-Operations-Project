import React, { useEffect, useRef } from "react";
import { MessageSquareText } from "lucide-react";
import type { ChatMessage } from "./types";

type MessageListProps = {
  messages: ChatMessage[];
};

type MermaidBlock = {
  type: "mermaid";
  code: string;
};

type TextBlock = {
  type: "text";
  text: string;
};

type MessageBlock = MermaidBlock | TextBlock;

export function MessageList({ messages }: MessageListProps) {
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages]);

  return (
    <div className="messages" ref={messagesRef}>
      {messages.length === 0 ? (
        <div className="empty-chat">
          <MessageSquareText size={30} />
          <strong>先选择知识库，再输入问题</strong>
          <span>未提问前不会展示引用来源；发送问题后才会根据召回结果显示相关文档。</span>
        </div>
      ) : (
        <>
          {messages.map((message, index) => <MessageBubble message={message} key={`${message.role}-${index}`} />)}
        </>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const blocks = message.role === "assistant" ? splitMermaidBlocks(message.content) : [{ type: "text" as const, text: message.content }];

  return (
    <div className={`message ${message.role}`}>
      {blocks.map((block, index) => {
        if (block.type === "mermaid") {
          return <MermaidFlowChart code={block.code} key={`mermaid-${index}`} />;
        }
        return <TextContent text={block.text} key={`text-${index}`} />;
      })}
    </div>
  );
}

function splitMermaidBlocks(content: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  const fenceRegex = /```\s*(?:mermaid)?\s*([\s\S]*?)```/gi;
  let lastIndex = 0;
  for (const match of content.matchAll(fenceRegex)) {
    const fullMatch = match[0];
    const code = normalizeMermaidCode(match[1] ?? "");
    const start = match.index ?? 0;
    const before = content.slice(lastIndex, start).trim();
    if (before) blocks.push({ type: "text", text: before });
    if (isMermaidCode(code)) blocks.push({ type: "mermaid", code });
    else if (fullMatch.trim()) blocks.push({ type: "text", text: fullMatch.trim() });
    lastIndex = start + fullMatch.length;
  }
  const tail = content.slice(lastIndex).trim();
  if (tail) blocks.push({ type: "text", text: tail });
  return blocks.length > 0 ? blocks : [{ type: "text", text: content }];
}

function normalizeMermaidCode(code: string) {
  return code
    .replace(/^mermaid\s+/i, "")
    .replace(/\\n/g, "\n")
    .trim();
}

function isMermaidCode(code: string) {
  return /^(flowchart|graph)\s+(LR|RL|TD|TB|BT)/i.test(code.trim());
}

function TextContent({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((paragraph, index) => (
        <p className="message-paragraph" key={`${paragraph}-${index}`}>{paragraph}</p>
      ))}
    </>
  );
}

function MermaidFlowChart({ code }: { code: string }) {
  const chart = parseMermaidFlow(code);
  if (!chart.nodes.length) {
    return <pre className="mermaid-source">{code}</pre>;
  }
  return (
    <div className={`mermaid-flow ${chart.direction === "TD" || chart.direction === "TB" ? "vertical" : "horizontal"}`}>
      <div className="mermaid-flow-title">流程图</div>
      <div className="mermaid-flow-nodes">
        {chart.nodes.map((node, index) => (
          <React.Fragment key={node.id}>
            <div className="mermaid-node">
              <span>{index + 1}</span>
              <strong>{node.label}</strong>
            </div>
            {index < chart.nodes.length - 1 && <div className="mermaid-edge" aria-hidden="true">→</div>}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function parseMermaidFlow(code: string) {
  const normalized = code.replace(/\r\n/g, "\n").trim();
  const directionMatch = normalized.match(/^(?:flowchart|graph)\s+(LR|RL|TD|TB|BT)/i);
  const direction = (directionMatch?.[1]?.toUpperCase() ?? "LR") as "LR" | "RL" | "TD" | "TB" | "BT";
  const nodesById = new Map<string, string>();
  const nodeOrder: string[] = [];
  const nodeRegex = /([A-Za-z0-9_]+)\s*\[([^\]]+)\]/g;
  for (const match of normalized.matchAll(nodeRegex)) {
    const id = match[1];
    const label = match[2].trim();
    if (!nodesById.has(id)) {
      nodeOrder.push(id);
    }
    nodesById.set(id, label);
  }
  if (!nodeOrder.length) {
    const lines = normalized.split("\n").slice(1);
    for (const line of lines) {
      const parts = line.split(/-->|---|==>/).map((part) => part.trim()).filter(Boolean);
      for (const label of parts) {
        const normalizedLabel = label.replace(/^["']|["']$/g, "").trim();
        if (!normalizedLabel || nodesById.has(normalizedLabel)) continue;
        nodeOrder.push(normalizedLabel);
        nodesById.set(normalizedLabel, normalizedLabel);
      }
    }
  }

  return {
    direction,
    nodes: nodeOrder.map((id) => ({ id, label: nodesById.get(id) ?? id })).slice(0, 10),
  };
}
