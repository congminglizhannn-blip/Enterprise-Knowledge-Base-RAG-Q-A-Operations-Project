import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);

function element(type, props, ...children) {
  return { type, props: { ...(props ?? {}), children } };
}

const react = {
  default: { createElement: element },
  createElement: element,
  useEffect() {},
  useRef: (current) => ({ current }),
  useState: (initial) => [initial, () => {}],
};

function load(file, dependencies = {}) {
  const path = fileURLToPath(new URL(`../${file}`, import.meta.url));
  const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)((name) => dependencies[name] ?? require(name), module, module.exports);
  return module.exports;
}

function findByText(node, text) {
  if (!node || typeof node !== "object") return null;
  const children = node.props?.children ?? [];
  if (children.includes(text)) return node;
  for (const child of children.flat()) {
    const found = findByText(child, text);
    if (found) return found;
  }
  return null;
}

test("knowledge refresh button does not pass the click event into refreshDocuments", async () => {
  const { KnowledgePage } = load("features/documents/KnowledgePage.tsx", {
    react,
    "lucide-react": { FileText: () => null, Search: () => null },
    "@/components/ui/Card": { Card: ({ children }) => element("card", null, children) },
    "@/types/common": { ApiError: class ApiError extends Error {} },
    "./api": { deleteDocument: async () => {}, getDocument: async () => ({}) },
    "./DocumentDetailModal": { DocumentDetailModal: () => null },
    "./DocumentTable": { DocumentTable: () => null },
  });
  const calls = [];
  const tree = KnowledgePage({
    setSelectedKb() {},
    onEnterChat() {},
    onEnterIngestion() {},
    kbs: [],
    documentRows: [],
    refreshDocuments: async (...args) => { calls.push(args); },
    setNotice() {},
  });

  const button = findByText(tree, "刷新知识库");
  assert.ok(button);
  await button.props.onClick({ type: "click" });
  assert.deepEqual(calls, [[]]);
});
