import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);

function load(file, dependencies = {}) {
  const path = fileURLToPath(new URL(`../${file}`, import.meta.url));
  const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)((name) => dependencies[name] ?? require(name), module, module.exports);
  return module.exports;
}

const baseProps = {
  selectedKb: null,
  setSelectedKb() {},
  availableKbs: [],
  question: "",
  setQuestion() {},
  messages: [],
  setMessages() {},
  citations: [],
  setCitations() {},
  activeSessionId: null,
  setActiveSessionId() {},
  chatSessions: [],
  refreshSessions: async () => {},
  onUnauthorized() {},
  authenticatedFetch: async () => Response.json({}),
};

function loadChatPage() {
  return load("features/chat/ChatPage.tsx", {
    "@/components/ui/Card": { Card: ({ children, title }) => React.createElement("section", null, title, children) },
    "@/features/documents/DocumentDetailModal": { DocumentDetailModal: () => null },
    "@/lib/errors": { NETWORK_ERROR_MESSAGE: "network", isOfflineNow: () => false, toFriendlyError: (_error, fallback) => fallback },
    "@/types/common": { ApiError: class ApiError extends Error {} },
    "./CitationPanel": { CitationPanel: () => null },
    "./Composer": { Composer: () => null },
    "./MessageList": { MessageList: () => null },
    "./api": { createChatSession: async () => ({ id: "session-new", knowledge_base_id: "kb-1", title: "新会话", updated_at: "" }) },
    "./stream": { streamChat: async () => {} },
  }).ChatPage;
}

test("new chat button is disabled until a knowledge base is selected", () => {
  const ChatPage = loadChatPage();
  const emptyHtml = renderToStaticMarkup(React.createElement(ChatPage, baseProps));
  assert.match(emptyHtml, /新增对话/);
  assert.match(emptyHtml, /new-session-btn[^"]*" disabled=""/);

  const selectedHtml = renderToStaticMarkup(React.createElement(ChatPage, {
    ...baseProps,
    selectedKb: { id: "kb-1", name: "知识库", scope: "department", targetId: "dept", dept: "dept", docs: 0, chunks: 0, status: "", updated: "" },
    availableKbs: [{ id: "kb-1", name: "知识库", scope: "department", targetId: "dept", dept: "dept", docs: 0, chunks: 0, status: "", updated: "" }],
  }));
  assert.doesNotMatch(selectedHtml, /new-session-btn[^"]*" disabled=""/);
});

test("createChatSession posts to the session creation endpoint", async () => {
  let request;
  const { createChatSession } = load("features/chat/api.ts", {
    "@/lib/apiClient": {
      apiJson: async (input, init) => {
        request = { input, init };
        return { id: "session-new" };
      },
    },
  });

  await createChatSession({ knowledge_base_id: "kb-1", title: "新会话" });
  assert.equal(request.input, "/api/sessions");
  assert.equal(request.init.method, "POST");
  assert.deepEqual(JSON.parse(request.init.body), { knowledge_base_id: "kb-1", title: "新会话" });
});
