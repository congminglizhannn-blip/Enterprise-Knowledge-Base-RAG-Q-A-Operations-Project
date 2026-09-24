import { RotateCcw, Search } from "lucide-react";
import type { HistoryOptions, HistoryQuery, HistoryRole } from "./historyTypes";

type Props = {
  role: HistoryRole; departmentName: string; query: HistoryQuery; keyword: string;
  options: HistoryOptions; optionsLoading: boolean;
  onKeyword: (value: string) => void; onChange: (patch: Partial<HistoryQuery>) => void;
  onReset: () => void; onSearch: () => void;
};
export function HistoryFilterBar({ role, departmentName, query, keyword, options, optionsLoading, onKeyword, onChange, onReset, onSearch }: Props) {
  return <form className="history-filters" onSubmit={(event) => { event.preventDefault(); onSearch(); }}>
    <div className="search-box history-search"><Search size={18} /><input aria-label="搜索问答历史" value={keyword} onChange={(event) => onKeyword(event.target.value)} placeholder="按问题、用户、知识库搜索" /></div>
    <div className="history-filter-fields">
      {role === "super_admin" && <>
        <label>组织<select aria-label="组织筛选" value={query.org_id} disabled={optionsLoading} onChange={(e) => onChange({ org_id: e.target.value })}><option value="">全部组织</option>{options.organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
        <label>部门<select aria-label="部门筛选" value={query.dept_id} disabled={optionsLoading} onChange={(e) => onChange({ dept_id: e.target.value })}><option value="">全部部门</option>{options.departments.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      </>}
      {role === "dept_admin" && <label>部门<select aria-label="部门筛选" disabled value="current"><option value="current">{departmentName}（含子部门）</option></select></label>}
      <label>知识库<select aria-label="知识库筛选" value={query.kb_id} disabled={optionsLoading} onChange={(e) => onChange({ kb_id: e.target.value })}><option value="">全部知识库</option>{options.knowledge_bases.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      {role !== "user" && <label>用户<select aria-label="用户筛选" value={query.user_id} disabled={optionsLoading} onChange={(e) => onChange({ user_id: e.target.value })}><option value="">全部用户</option>{options.users.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
      <label>更新开始时间<input aria-label="更新开始时间" type="datetime-local" value={query.start_time} onChange={(e) => onChange({ start_time: e.target.value })} /></label>
      <label>更新结束时间<input aria-label="更新结束时间" type="datetime-local" value={query.end_time} onChange={(e) => onChange({ end_time: e.target.value })} /></label>
      <button type="button" className="secondary-btn" onClick={onReset}><RotateCcw size={16} />重置</button>
      <button type="submit" className="primary-btn small"><Search size={16} />查询</button>
    </div>
  </form>;
}
