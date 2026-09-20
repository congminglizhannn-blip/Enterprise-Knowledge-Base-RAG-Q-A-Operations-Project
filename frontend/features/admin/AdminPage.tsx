"use client";

import { useEffect, useState } from "react";
import {
  Archive,
  Building2,
  CheckCircle2,
  Clock3,
  Search,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { Stat } from "@/components/ui/Stat";
import { mapBackendRole } from "@/features/auth/utils";
import { formatTokenCount } from "@/lib/format";
import { toFriendlyError } from "@/lib/errors";
import type { AuthenticatedFetch } from "@/types/common";
import type { Role } from "@/features/auth/types";
import type { AdminDepartmentRow, AdminStats, AdminUserRow } from "@/features/admin/types";
import { InvitePage } from "./InvitePage";
import { KnowledgeBaseConfigPanel } from "./KnowledgeBaseConfigPanel";
import { OrganizationPanel } from "./OrganizationPanel";

export type AdminPageProps = {
  role: Role;
  refreshDocuments: () => Promise<void>;
  authenticatedFetch: AuthenticatedFetch;
};

export function AdminPage({
  role,
  refreshDocuments,
  authenticatedFetch,
}: AdminPageProps) {
  type AdminTab = "users" | "departments" | "knowledge";
  const [adminDataVersion, setAdminDataVersion] = useState(0);
  const [stats, setStats] = useState<AdminStats>({ users: 0, departments: 0, knowledge_bases: 0, today_tokens: 0 });
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);
  const [departments, setDepartments] = useState<AdminDepartmentRow[]>([]);
  const [adminNotice, setAdminNotice] = useState("");
  const [activeTab, setActiveTab] = useState<AdminTab>("users");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [editingUser, setEditingUser] = useState<AdminUserRow | null>(null);
  const [editRole, setEditRole] = useState("user");
  const [editDepartmentId, setEditDepartmentId] = useState("");
  const isSuperAdmin = role === "超级管理员";
  const filteredUsers = adminUsers.filter((user) => {
    const keyword = searchKeyword.trim().toLowerCase();
    const matchesKeyword = !keyword || user.username.toLowerCase().includes(keyword);
    const matchesDepartment = !departmentFilter || user.department_id === departmentFilter;
    const matchesRole = !roleFilter || user.role === roleFilter;
    return matchesKeyword && matchesDepartment && matchesRole;
  });

  useEffect(() => {
    void refreshAdminData();
  }, [adminDataVersion]);

  async function refreshAdminData() {
    try {
      const [statsResponse, usersResponse] = await Promise.all([
        authenticatedFetch("/api/admin/stats"),
        authenticatedFetch("/api/admin/users"),
      ]);
      const departmentsResponse = await authenticatedFetch("/api/departments");
      setStats(await statsResponse.json());
      setAdminUsers(await usersResponse.json());
      setDepartments(await departmentsResponse.json());
      setAdminNotice("");
    } catch (error) {
      setAdminNotice(toFriendlyError(error, "系统管理数据加载失败，请确认当前账号管理员权限。"));
    }
  }

  function openEditUser(user: AdminUserRow) {
    setEditingUser(user);
    setEditRole(user.role);
    setEditDepartmentId(user.department_id);
  }

  async function submitUserRole() {
    if (!editingUser) return;
    try {
      await authenticatedFetch(`/api/users/${editingUser.id}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: editRole, department_id: editDepartmentId }),
      });
      setEditingUser(null);
      setAdminDataVersion((version) => version + 1);
      setAdminNotice("用户角色已更新。");
    } catch (error) {
      setAdminNotice(toFriendlyError(error, "用户角色更新失败，请确认权限和部门选择。"));
    }
  }

  async function toggleUserStatus(user: AdminUserRow) {
    try {
      await authenticatedFetch(`/api/users/${user.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !user.is_active }),
      });
      setAdminDataVersion((version) => version + 1);
      setAdminNotice(user.is_active ? "用户已禁用。" : "用户已启用。");
    } catch (error) {
      setAdminNotice(toFriendlyError(error, "用户状态修改失败，不能修改当前账号或无权限账号。"));
    }
  }

  function resetUserFilters() {
    setSearchKeyword("");
    setDepartmentFilter("");
    setRoleFilter("");
    setActiveTab("users");
  }

  const permissionBoundary = (
    <Card title="权限边界">
      <div className="policy-list">
        <p><ShieldCheck size={18} />当前角色：{role}</p>
        {isSuperAdmin ? (
          <>
            <p><CheckCircle2 size={18} />管辖范围：全组织管理视角。</p>
            <p><CheckCircle2 size={18} />可创建组织、知识库，并任命部门管理员。</p>
          </>
        ) : (
          <>
            <p><CheckCircle2 size={18} />管辖范围：仅当前部门。</p>
            <p><CheckCircle2 size={18} />不能修改用户角色或跨部门管理数据。</p>
          </>
        )}
        <p><CheckCircle2 size={18} />禁用用户会使其后续无法登录，但保留历史数据。</p>
      </div>
    </Card>
  );

  return (
    <section className="content-stack">
      <div className="stats-row">
        <button className="stat-button" onClick={resetUserFilters}><Stat icon={UsersRound} label="用户数" value={String(stats.users)} /></button>
        <button className="stat-button" onClick={() => setActiveTab("departments")}><Stat icon={Building2} label="部门数" value={String(stats.departments)} /></button>
        <button className="stat-button" onClick={() => setActiveTab("knowledge")}><Stat icon={Archive} label="知识库" value={String(stats.knowledge_bases)} /></button>
        <Stat icon={Clock3} label="今日 Token" value={formatTokenCount(stats.today_tokens)} />
      </div>
      {adminNotice && <div className="notice-bar">{adminNotice}</div>}
      <div className="admin-tabs">
        <button className={activeTab === "users" ? "active" : ""} onClick={() => setActiveTab("users")}>用户管理</button>
        <button className={activeTab === "departments" ? "active" : ""} onClick={() => setActiveTab("departments")}>部门管理</button>
        <button className={activeTab === "knowledge" ? "active" : ""} onClick={() => setActiveTab("knowledge")}>知识库管理</button>
      </div>
      {activeTab === "knowledge" ? (
        <div className="two-col admin-management-layout">
          <KnowledgeBaseConfigPanel key={adminDataVersion} enabled={role !== "普通用户"} adminRole={role} onCreated={async () => {
            await refreshDocuments();
            setAdminDataVersion((version) => version + 1);
          }} />
          {permissionBoundary}
        </div>
      ) : (
      <div className="two-col admin-management-layout">
        <Card title={activeTab === "users" ? "用户管理" : activeTab === "departments" ? "部门管理" : "知识库管理"}>
          {activeTab === "users" && (
            <>
              <div className="admin-table-toolbar">
                <div className="search-box"><Search size={16} /><input value={searchKeyword} onChange={(event) => setSearchKeyword(event.target.value)} placeholder="按用户名搜索" /></div>
                {(departmentFilter || roleFilter || searchKeyword) && <button className="secondary-btn" onClick={resetUserFilters}>清除筛选</button>}
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>用户名</th><th>角色</th><th>部门</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr><td colSpan={5}>暂无用户</td></tr>
                    ) : filteredUsers.map((user) => (
                      <tr key={user.id}>
                        <td>{user.username}</td>
                        <td><button className="link-cell" onClick={() => setRoleFilter(roleFilter === user.role ? "" : user.role)}>{mapBackendRole(user.role)}</button></td>
                        <td><button className="link-cell" onClick={() => setDepartmentFilter(departmentFilter === user.department_id ? "" : user.department_id)}>{user.department_name || "-"}</button></td>
                        <td>{user.is_active ? (user.must_change_password ? "需改密" : "启用") : "停用"}</td>
                        <td>
                          <button className="table-action" disabled={!isSuperAdmin} onClick={() => openEditUser(user)}>编辑角色</button>
                          <button className="table-action" disabled={!isSuperAdmin} onClick={() => toggleUserStatus(user)}>{user.is_active ? "禁用" : "启用"}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {activeTab === "departments" && (
            <DataTable
              headers={["部门名称", "部门ID", "组织ID", "说明"]}
              rows={departments.length > 0
                ? departments.map((department) => [department.name, department.id, department.org_id, department.description || "-"])
                : [["暂无部门", "-", "-", "-"]]}
            />
          )}
        </Card>
        {permissionBoundary}
      </div>
      )}
      <OrganizationPanel enabled={isSuperAdmin} onChanged={() => setAdminDataVersion((version) => version + 1)} />
      <InvitePage enabled={isSuperAdmin} />
      {editingUser && (
        <Modal>
          <header>
            <div>
              <span>用户权限</span>
              <h3>编辑角色</h3>
            </div>
            <button className="icon-btn" onClick={() => setEditingUser(null)}>×</button>
          </header>
          <div className="admin-kb-form">
            <label><span>用户名</span><input value={editingUser.username} readOnly /></label>
            <label>
              <span>所属部门</span>
              <select value={editDepartmentId} onChange={(event) => setEditDepartmentId(event.target.value)}>
                {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
              </select>
            </label>
            <label>
              <span>系统角色</span>
              <select value={editRole} onChange={(event) => setEditRole(event.target.value)}>
                <option value="user">普通成员</option>
                <option value="dept_admin">部门管理员</option>
                <option value="super_admin">超级管理员</option>
              </select>
            </label>
            <button className="primary-btn" disabled={!editDepartmentId} onClick={submitUserRole}>保存修改</button>
          </div>
        </Modal>
      )}
    </section>
  );
}
