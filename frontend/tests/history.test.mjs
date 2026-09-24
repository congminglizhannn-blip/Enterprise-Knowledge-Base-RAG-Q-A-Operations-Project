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
  const path = fileURLToPath(new URL(`../features/chat/${file}`, import.meta.url));
  const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
    fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)((name) => dependencies[name] ?? require(name), module, module.exports);
  return module.exports;
}
const helpers = load("historyQuery.ts");
const { defaultHistoryQuery, updateHistoryQuery, sortHistory, historyParams } = helpers;
const { HistoryFilterBar } = load("HistoryFilterBar.tsx");
const { HistoryTable, SortableHistoryHeader } = load("HistoryTable.tsx");
const options = { organizations: [{ id: "org", name: "组织甲" }], departments: [{ id: "dept", name: "真实部门" }], knowledge_bases: [{ id: "kb", name: "后端授权知识库" }], users: [{ id: "user", name: "真实用户" }] };
const props = { role: "super_admin", departmentName: "真实部门", query: defaultHistoryQuery, keyword: "", options, optionsLoading: false, onKeyword() {}, onChange() {}, onReset() {}, onSearch() {} };
const renderFilters = (role) => renderToStaticMarkup(React.createElement(HistoryFilterBar, { ...props, role }));

test("admin sees organization and department selectors", () => {
  const html = renderFilters("super_admin");
  assert.match(html, /aria-label="组织筛选"/);
  assert.match(html, /aria-label="部门筛选"/);
  assert.match(html, /组织甲/);
});
test("department manager is locked to their named department including descendants", () => {
  const html = renderFilters("dept_admin");
  assert.doesNotMatch(html, /aria-label="组织筛选"/);
  assert.match(html, /aria-label="部门筛选"[^>]*disabled/);
  assert.match(html, /真实部门（含子部门）/);
});
test("employee sees no organization, department or user selectors", () => {
  const html = renderFilters("user");
  for (const label of ["组织筛选", "部门筛选", "用户筛选"]) assert.ok(!html.includes(label));
});
test("organization change clears department and resets page", () => {
  const query = updateHistoryQuery({ ...defaultHistoryQuery, org_id: "old", dept_id: "old-dept", page: 4 }, { org_id: "new" });
  assert.equal(query.dept_id, ""); assert.equal(query.page, 1);
});
test("knowledge base options use server-provided values without static entries", () => {
  assert.match(renderFilters("user"), /后端授权知识库/);
  const html = renderToStaticMarkup(React.createElement(HistoryFilterBar, { ...props, options: { ...options, knowledge_bases: [] } }));
  assert.doesNotMatch(html, /后端授权知识库/);
});
test("sort header click toggles requested column and resets page", () => {
  for (const column of ["round_count", "updated_at"]) {
    let query = { ...defaultHistoryQuery, page: 3 };
    const header = SortableHistoryHeader({ label: "排序", column, query, onSort: (value) => { query = sortHistory(query, value); } });
    header.props.children.props.onClick();
    assert.equal(query.page, 1);
    assert.equal(historyParams(query, "super_admin").get("sort_by"), column);
    const previous = query.sort_order;
    query = sortHistory(query, column);
    assert.notEqual(query.sort_order, previous);
  }
});
test("empty table renders explicit no-data state", () => {
  const html = renderToStaticMarkup(React.createElement(HistoryTable, { items: [], role: "user", query: defaultHistoryQuery, loading: false, error: "", onSort() {} }));
  assert.match(html, /暂无数据/);
});
test("API includes paging and ISO time, and fetches dependent department options from backend", async () => {
  const calls = [];
  const api = load("historyApi.ts", { "./historyQuery": helpers, "@/lib/apiClient": { apiJson: async (...args) => { calls.push(args); return options; } } });
  await api.fetchHistory({ ...defaultHistoryQuery, start_time: "2026-09-24T00:00:00+08:00", org_id: "ignored", user_id: "ignored" }, "user");
  const url = new URL(calls[0][0], "http://localhost");
  assert.equal(url.searchParams.get("start_time"), "2026-09-23T16:00:00.000Z");
  assert.equal(url.searchParams.get("page_size"), "20");
  assert.equal(url.searchParams.has("org_id"), false);
  assert.equal(url.searchParams.has("user_id"), false);
  await api.fetchHistoryOptions("new-org");
  assert.equal(calls[1][0], "/api/qa-history/filter-options?org_id=new-org");
});
