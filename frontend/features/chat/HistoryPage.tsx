"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { toFriendlyError } from "@/lib/errors";
import { HistoryFilterBar } from "./HistoryFilterBar";
import { HistoryTable } from "./HistoryTable";
import { fetchHistory, fetchHistoryOptions } from "./historyApi";
import { defaultHistoryQuery, sortHistory, updateHistoryQuery } from "./historyQuery";
import type { HistoryOptions, HistoryQuery, HistoryResult, HistoryRole } from "./historyTypes";

const emptyOptions: HistoryOptions = { organizations: [], departments: [], knowledge_bases: [], users: [] };

export function HistoryPage({ role, departmentName }: { role: HistoryRole; departmentName: string }) {
  const [query, setQuery] = useState<HistoryQuery>({ ...defaultHistoryQuery });
  const [keyword, setKeyword] = useState("");
  const [options, setOptions] = useState<HistoryOptions>(emptyOptions);
  const [result, setResult] = useState<HistoryResult>({ items: [], total: 0, page: 1, page_size: 20 });
  const [loading, setLoading] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [error, setError] = useState("");
  const [optionsError, setOptionsError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setQuery((current) => current.keyword === keyword ? current : updateHistoryQuery(current, { keyword })), 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    const controller = new AbortController();
    setOptionsLoading(true);
    setOptionsError("");
    void fetchHistoryOptions(role === "super_admin" ? query.org_id : "", controller.signal).then((data) => {
      if (!controller.signal.aborted) setOptions(data);
    }).catch((err) => {
      if (!controller.signal.aborted) { setOptions(emptyOptions); setOptionsError(toFriendlyError(err, "筛选选项加载失败，请点击查询重试。")); }
    }).finally(() => { if (!controller.signal.aborted) setOptionsLoading(false); });
    return () => controller.abort();
  }, [role, query.org_id, version]);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    if (query.start_time && query.end_time && new Date(query.start_time) > new Date(query.end_time)) {
      setError("开始时间不能晚于结束时间"); setLoading(false); return;
    }
    setLoading(true);
    void fetchHistory(query, role, controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult(data);
    }).catch((err) => {
      if (!controller.signal.aborted) setError(toFriendlyError(err, "历史加载失败，请重试。"));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, role, version]);

  return <section className="content-stack">
    <HistoryFilterBar role={role} departmentName={departmentName} query={query} keyword={keyword} options={options} optionsLoading={optionsLoading}
      onKeyword={setKeyword} onChange={(patch) => setQuery((current) => updateHistoryQuery(current, patch))}
      onReset={() => { setKeyword(""); setQuery({ ...defaultHistoryQuery }); setVersion((v) => v + 1); }}
      onSearch={() => { setQuery((current) => updateHistoryQuery(current, { keyword })); setVersion((v) => v + 1); }} />
    {(error || optionsError) && <div className="notice-bar" role="alert">{[error, optionsError].filter(Boolean).join("；")}</div>}
    <Card title="问答历史与审计">
      <HistoryTable items={result.items} role={role} query={query} loading={loading} error={error} onSort={(column) => setQuery((current) => sortHistory(current, column))} />
      <div className="history-pagination">
        <span>{loading ? "正在加载" : error ? "数据暂不可用" : `共 ${result.total} 条 · 第 ${result.page} 页`}</span>
        <label>每页<select aria-label="每页条数" value={query.page_size} onChange={(e) => setQuery((current) => updateHistoryQuery(current, { page_size: Number(e.target.value) }))}>{[20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <button className="secondary-btn" disabled={loading || !!error || query.page <= 1} onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))}>上一页</button>
        <button className="secondary-btn" disabled={loading || !!error || query.page * query.page_size >= result.total} onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))}>下一页</button>
      </div>
    </Card>
  </section>;
}
