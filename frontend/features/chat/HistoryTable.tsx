import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { HistoryItem, HistoryQuery, HistoryRole } from "./historyTypes";

export function SortableHistoryHeader({ label, column, query, onSort }: {
  label: string; column: HistoryQuery["sort_by"]; query: HistoryQuery; onSort: (column: HistoryQuery["sort_by"]) => void;
}) {
  const selected = query.sort_by === column;
  const Icon = selected ? query.sort_order === "asc" ? ArrowUp : ArrowDown : ArrowUpDown;
  return <th aria-sort={selected ? query.sort_order === "asc" ? "ascending" : "descending" : "none"}>
    <button type="button" className="link-cell history-sort" onClick={() => onSort(column)}>{label}<Icon size={14} /></button>
  </th>;
}
export function HistoryTable({ items, role, query, loading, error, onSort }: {
  items: HistoryItem[]; role: HistoryRole; query: HistoryQuery; loading: boolean; error: string;
  onSort: (column: HistoryQuery["sort_by"]) => void;
}) {
  const columns = role === "super_admin" ? 7 : role === "dept_admin" ? 6 : 5;
  return <div className="table-wrap"><table aria-label="问答历史列表" aria-busy={loading}>
    <thead><tr><th>会话标题 / 问题</th><th>用户</th>{role === "super_admin" && <th>组织</th>}{role !== "user" && <th>部门</th>}<th>知识库</th>
      <SortableHistoryHeader label="问答轮数" column="round_count" query={query} onSort={onSort} />
      <SortableHistoryHeader label="更新时间" column="updated_at" query={query} onSort={onSort} />
    </tr></thead>
    <tbody>{loading || error || items.length === 0 ? <tr><td colSpan={columns}>{loading ? "正在加载…" : error ? "加载失败，请重试查询" : "暂无数据"}</td></tr> : items.map((item) => <tr key={item.id}>
      <td>{item.title}</td><td>{item.user_name}</td>{role === "super_admin" && <td>{item.org_name}</td>}{role !== "user" && <td>{item.dept_name}</td>}<td>{item.kb_name}</td><td>{item.round_count}</td><td>{new Date(item.updated_at).toLocaleString("zh-CN", { hour12: false })}</td>
    </tr>)}</tbody>
  </table></div>;
}
