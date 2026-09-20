"use client";

import React from "react";
import { GitBranch } from "lucide-react";

type FlowStep = {
  title: string;
  desc: string;
  kind?: "start" | "process" | "decision" | "risk" | "done";
};

const flows: { title: string; summary: string; steps: FlowStep[] }[] = [
  {
    title: "文档入库流程",
    summary: "从用户上传或导入公开飞书链接开始，到文档解析、分块、向量入库和状态回写结束。",
    steps: [
      { title: "选择知识库", desc: "用户在所属部门权限范围内选择单个知识库。", kind: "start" },
      { title: "上传或导入", desc: "上传 Word、Excel、PDF、扫描 PDF，或提交公开飞书链接。" },
      { title: "格式校验", desc: "校验文件类型、大小、链接可访问性和用户权限。", kind: "decision" },
      { title: "保存原文", desc: "保存原始文件或链接正文，创建 documents 记录。" },
      { title: "解析分块", desc: "提取文本，按长度和语义窗口生成 chunk。" },
      { title: "向量入库", desc: "写入 document_chunks，带 department_id 和 knowledge_base_id。", kind: "done" },
    ],
  },
  {
    title: "RAG 问答流程",
    summary: "用户提问后，系统先做权限过滤，再召回片段、组装 prompt，并通过 SSE 流式返回答案。",
    steps: [
      { title: "输入问题", desc: "用户选择单个知识库并提交问题。", kind: "start" },
      { title: "鉴权过滤", desc: "后端读取当前用户角色和部门，SQL 层限制检索范围。", kind: "decision" },
      { title: "向量召回", desc: "在有权限的 chunk 内召回 top_k 相关片段。" },
      { title: "Prompt 组装", desc: "拼接问题、召回片段、引用规则和敏感数据约束。" },
      { title: "模型生成", desc: "调用 DeepSeek 兼容接口，按 SSE 返回增量内容。" },
      { title: "展示引用", desc: "答案完成后展示文档名称和原文片段。", kind: "done" },
    ],
  },
  {
    title: "权限与审计流程",
    summary: "所有业务动作都围绕用户角色、部门强隔离和审计日志展开。",
    steps: [
      { title: "用户登录", desc: "账号密码登录，后端签发 JWT。", kind: "start" },
      { title: "识别角色", desc: "区分超级管理员、部门管理员、普通用户。" },
      { title: "部门强隔离", desc: "知识库、文档、chunk、会话均按部门过滤。", kind: "decision" },
      { title: "执行业务", desc: "上传、删除、问答、管理用户等操作。" },
      { title: "写入审计", desc: "记录用户、时间、动作、token 消耗和召回文档。" },
      { title: "反馈回看", desc: "管理员按权限查看日志和人工反馈。", kind: "done" },
    ],
  },
  {
    title: "异常处理流程",
    summary: "把解析失败、无权限、无召回结果、模型错误等情况显式反馈给用户。",
    steps: [
      { title: "触发任务", desc: "上传文档、导入链接或发起问答。", kind: "start" },
      { title: "检测异常", desc: "格式错误、权限不足、解析失败、召回为空或模型超时。", kind: "risk" },
      { title: "状态回写", desc: "文档状态改为 failed，问答返回可理解的错误说明。" },
      { title: "用户处理", desc: "重新上传、调整问题、联系管理员或查看日志。" },
      { title: "审计记录", desc: "保留错误码、错误信息和关联资源。", kind: "done" },
    ],
  },
];

export function WorkflowPage() {
  return (
    <section className="content-stack">
      <div className="workflow-header">
        <div>
          <h3>核心业务流程图</h3>
          <p>基于 PRD 和 AGENTS.md，将前端展示、文档入库、RAG 检索、权限过滤和审计闭环拆成可读流程。</p>
        </div>
        <span className="pill"><GitBranch size={16} />MVP 流程视图</span>
      </div>
      <div className="workflow-grid">
        {flows.map((flow) => (
          <FlowDiagram key={flow.title} {...flow} />
        ))}
      </div>
    </section>
  );
}

function FlowDiagram({ title, summary, steps }: { title: string; summary: string; steps: FlowStep[] }) {
  return (
    <section className="flow-card">
      <header>
        <h3>{title}</h3>
        <p>{summary}</p>
      </header>
      <div className="flow-diagram" aria-label={title}>
        {steps.map((step, index) => (
          <React.Fragment key={step.title}>
            <article className={`flow-node ${step.kind ?? "process"}`}>
              <span>{index + 1}</span>
              <strong>{step.title}</strong>
              <p>{step.desc}</p>
            </article>
            {index < steps.length - 1 && <div className="flow-arrow" aria-hidden="true"></div>}
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}
