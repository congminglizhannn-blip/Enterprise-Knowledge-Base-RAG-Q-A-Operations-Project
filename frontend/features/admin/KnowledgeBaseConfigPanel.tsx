"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Database, Pencil, RefreshCw, Search, Power } from "lucide-react";
import {
  createKnowledgeBase,
  updateKnowledgeBaseStatus,
  listDepartments,
  listKnowledgeBases,
  listOrganizations,
  updateKnowledgeBase,
} from "@/features/documents/api";
import type { BackendKnowledgeBase, DepartmentInfo, OrganizationInfo } from "@/features/documents/types";
import { ApiError } from "@/types/common";

type KnowledgeBaseConfigPanelProps = {
  enabled: boolean;
  adminRole: string;
  onCreated?: () => Promise<void> | void;
};

type Scope = "global" | "organization" | "department";

export function KnowledgeBaseConfigPanel({ enabled, adminRole, onCreated }: KnowledgeBaseConfigPanelProps) {
  const [organizations, setOrganizations] = useState<OrganizationInfo[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<BackendKnowledgeBase[]>([]);
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
  const [scope, setScope] = useState<Scope>("organization");
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [keyword, setKeyword] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"" | Scope>("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [statusPendingId, setStatusPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingKb, setEditingKb] = useState<BackendKnowledgeBase | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editScope, setEditScope] = useState<Scope>("department");
  const [editOrgId, setEditOrgId] = useState("");
  const [editDepartmentId, setEditDepartmentId] = useState("");
  const [editDepartments, setEditDepartments] = useState<DepartmentInfo[]>([]);
  const isSuperAdmin = adminRole === "超级管理员";

  const selectedOrg = useMemo(
    () => organizations.find((org) => org.id === selectedOrgId) ?? null,
    [organizations, selectedOrgId],
  );
  const ownerOptions = useMemo(() => {
    const entries = new Map<string, string>();
    knowledgeBases.forEach((kb) => {
      const key = ownerKey(kb);
      const label = ownerLabel(kb);
      if (key && label) entries.set(key, label);
    });
    return Array.from(entries, ([value, label]) => ({ value, label }));
  }, [knowledgeBases]);
  const visibleKbs = knowledgeBases.filter((kb) => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const matchesKeyword = !normalizedKeyword || kb.name.toLowerCase().includes(normalizedKeyword);
    const matchesScope = !scopeFilter || kb.scope === scopeFilter;
    const matchesOwner = !ownerFilter || ownerKey(kb) === ownerFilter;
    return matchesKeyword && matchesScope && matchesOwner;
  });

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled]);

  useEffect(() => {
    if (!isSuperAdmin) setScope("department");
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!selectedOrgId) return;
    void refreshDepartments(selectedOrgId);
  }, [selectedOrgId]);

  useEffect(() => {
    setSelectedDepartmentId("");
  }, [scope, selectedOrgId]);

  useEffect(() => {
    if (!editingKb || !editOrgId || !isSuperAdmin) return;
    void refreshEditDepartments(editOrgId);
  }, [editingKb, editOrgId, isSuperAdmin]);

  if (!enabled) {
    return (
      <section className="card">
        <h3>组织知识库配置</h3>
        <div className="empty-table-state">
          <Database size={24} />
          <strong>无权限</strong>
          <p>仅管理员可以配置知识库。</p>
        </div>
      </section>
    );
  }

  async function refresh() {
    try {
      const [orgRows, kbRows] = await Promise.all([isSuperAdmin ? listOrganizations() : Promise.resolve([]), listKnowledgeBases({ includeDisabled: true })]);
      setOrganizations(orgRows);
      setKnowledgeBases(kbRows);
      if (isSuperAdmin) {
        setSelectedOrgId((current) => current || orgRows[0]?.id || "");
      } else {
        const deptRows = await listDepartments();
        setDepartments(deptRows);
        setSelectedDepartmentId((current) => current || deptRows[0]?.id || "");
      }
      setNotice("知识库管理数据已同步。");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "知识库配置加载失败，请确认管理员权限。");
    }
  }

  async function refreshDepartments(orgId: string) {
    try {
      const rows = await listDepartments(orgId);
      setDepartments(rows);
      setSelectedDepartmentId((current) => current || rows[0]?.id || "");
    } catch {
      setDepartments([]);
      setSelectedDepartmentId("");
    }
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (isSuperAdmin && !selectedOrgId && scope !== "global") {
      setNotice("请先选择目标组织。");
      return;
    }
    if (scope === "department" && !selectedDepartmentId) {
      setNotice("请选择目标部门。");
      return;
    }
    if (!trimmedName) {
      setNotice("请填写知识库名称。");
      return;
    }
    setIsSubmitting(true);
    try {
      await createKnowledgeBase({
        org_id: selectedOrgId || undefined,
        scope,
        target_id: scope === "global" ? null : scope === "organization" ? selectedOrgId : selectedDepartmentId,
        name: trimmedName,
        description: description.trim(),
      });
      setName("");
      setDescription("");
      await refresh();
      await onCreated?.();
      setNotice("创建成功，拥有可见权限的用户刷新后即可看到该知识库。");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "创建失败，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  function openEdit(kb: BackendKnowledgeBase) {
    setEditingKb(kb);
    setEditName(kb.name);
    setEditDescription(kb.description ?? "");
    setEditScope(kb.scope ?? "department");
    setEditOrgId(kb.scope === "global" ? (organizations[0]?.id ?? "") : kb.org_id ?? "");
    setEditDepartmentId(kb.scope === "department" ? kb.target_id ?? kb.department_id : "");
    setEditDepartments([]);
  }

  async function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingKb) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setNotice("请填写知识库名称。");
      return;
    }
    if (isSuperAdmin && editScope !== "global" && !editOrgId) {
      setNotice("请选择目标组织。");
      return;
    }
    if (editScope === "department" && !editDepartmentId) {
      setNotice("请选择目标部门。");
      return;
    }
    try {
      await updateKnowledgeBase(editingKb.id, {
        name: trimmedName,
        description: editDescription.trim(),
        scope: editScope,
        org_id: editScope === "global" ? undefined : editOrgId,
        target_id: editScope === "global" ? null : editScope === "organization" ? editOrgId : editDepartmentId,
      });
      setEditingKb(null);
      await refresh();
      await onCreated?.();
      setNotice("知识库信息已更新。");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "更新失败，请确认权限或重名冲突。");
    }
  }

  async function refreshEditDepartments(orgId: string) {
    try {
      const rows = await listDepartments(orgId);
      setEditDepartments(rows);
      setEditDepartmentId((current) => current || rows[0]?.id || "");
    } catch {
      setEditDepartments([]);
      setEditDepartmentId("");
    }
  }

  async function handleToggleStatus(kb: BackendKnowledgeBase) {
    if (statusPendingId) return;
    if (kb.is_active && !window.confirm(`确认禁用知识库「${kb.name}」？文档、向量和历史将保留，禁用期间无法上传、解析或发起新问答，可随时重新启用。`)) return;
    setStatusPendingId(kb.id);
    try {
      await updateKnowledgeBaseStatus(kb.id, !kb.is_active);
      await refresh();
      await onCreated?.();
      setNotice(kb.is_active ? "知识库已禁用，数据已保留。" : "知识库已启用。");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "状态修改失败，请确认权限。");
    } finally {
      setStatusPendingId(null);
    }
  }

  return (
    <section className="card">
      <div className="card-heading-row">
        <h3>知识库管理</h3>
        <button className="secondary-btn" type="button" onClick={refresh}><RefreshCw size={16} />刷新</button>
      </div>
      <div className="admin-kb-layout">
        <form className="admin-kb-form" onSubmit={handleCreate}>
          <label>
            <span>可见范围</span>
            <select value={scope} disabled={!isSuperAdmin} onChange={(event) => setScope(event.target.value as Scope)}>
              {isSuperAdmin && <option value="global">全局公共</option>}
              {isSuperAdmin && <option value="organization">组织级</option>}
              <option value="department">部门级</option>
            </select>
          </label>
          {isSuperAdmin && scope !== "global" && <label>
            <span>目标组织</span>
            <select value={selectedOrgId} onChange={(event) => setSelectedOrgId(event.target.value)}>
              {organizations.length === 0 && <option value="">暂无组织</option>}
              {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          </label>}
          {scope === "department" && <label>
            <span>目标部门</span>
            <select value={selectedDepartmentId} onChange={(event) => setSelectedDepartmentId(event.target.value)}>
              {departments.length === 0 && <option value="">暂无部门</option>}
              {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
          </label>}
          {isSuperAdmin && scope !== "global" && <label>
            <span>关联组织</span>
            <input value={selectedOrg?.name ?? ""} readOnly />
          </label>}
          <label>
            <span>知识库名称</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：研发文档库" />
          </label>
          <label>
            <span>知识库描述</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="可选：说明该知识库的适用范围" />
          </label>
          <button className="primary-btn small" type="submit" disabled={isSubmitting || (isSuperAdmin && scope !== "global" && !selectedOrgId) || (scope === "department" && !selectedDepartmentId)}>
            <Database size={16} />{isSubmitting ? "创建中..." : "创建知识库"}
          </button>
        </form>
        <div className="admin-kb-list wide">
          <div className="admin-table-toolbar">
            <div className="search-box"><Search size={16} /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="按知识库名称搜索" /></div>
            <select value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value as "" | Scope)}>
              <option value="">全部范围</option>
              <option value="global">全局公共</option>
              <option value="organization">组织级</option>
              <option value="department">部门级</option>
            </select>
            <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
              <option value="">全部归属</option>
              {ownerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            {(keyword || scopeFilter || ownerFilter) && <button className="secondary-btn" type="button" onClick={() => { setKeyword(""); setScopeFilter(""); setOwnerFilter(""); }}>清除筛选</button>}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>知识库</th><th>作用域</th><th>归属</th><th>文档</th><th>Chunk</th><th>操作</th></tr></thead>
              <tbody>
                {visibleKbs.length === 0 ? (
                  <tr><td colSpan={6}>暂无知识库</td></tr>
                ) : visibleKbs.map((kb) => (
                  <tr key={kb.id} className={!kb.is_active ? "inactive-row" : ""}>
                    <td>
                      <strong>{kb.name}</strong>
                      {!kb.is_active && <small className="table-subtext">已禁用</small>}
                      {kb.description && <small className="table-subtext">{kb.description}</small>}
                    </td>
                    <td><button className="link-cell" aria-pressed={scopeFilter === (kb.scope ?? "department")} onClick={() => setScopeFilter(scopeFilter === (kb.scope ?? "department") ? "" : (kb.scope ?? "department"))}><span className={`scope-tag ${kb.scope ?? "department"}`}>{scopeLabel(kb.scope ?? "department")}</span></button></td>
                    <td><button className="link-cell" aria-pressed={ownerFilter === ownerKey(kb)} onClick={() => setOwnerFilter(ownerFilter === ownerKey(kb) ? "" : ownerKey(kb))}>{ownerLabel(kb)}</button></td>
                    <td>{kb.document_count ?? 0}</td>
                    <td>{kb.chunk_count ?? 0}</td>
                    <td>
                      <button className="table-action" disabled={!kb.is_active || (!isSuperAdmin && kb.scope !== "department")} onClick={() => openEdit(kb)}><Pencil size={14} />编辑</button>
                      <button className={`table-action${kb.is_active ? " danger" : ""}`} disabled={!!statusPendingId || (!isSuperAdmin && kb.scope !== "department")} onClick={() => handleToggleStatus(kb)}><Power size={14} />{kb.is_active ? "禁用" : "启用"}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {notice && <p className="muted-text">{notice}</p>}
      {editingKb && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="document-modal">
            <header>
              <div>
                <span>{scopeLabel(editingKb.scope ?? "department")} · {ownerLabel(editingKb)}</span>
                <h3>编辑知识库</h3>
              </div>
              <button className="icon-btn" onClick={() => setEditingKb(null)}>×</button>
            </header>
            <form className="admin-kb-form" onSubmit={handleEditSubmit}>
              <label>
                <span>知识库名称</span>
                <input value={editName} onChange={(event) => setEditName(event.target.value)} />
              </label>
              <label>
                <span>知识库描述</span>
                <textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} />
              </label>
              <label>
                <span>可见范围</span>
                <select value={editScope} disabled={!isSuperAdmin} onChange={(event) => {
                  setEditScope(event.target.value as Scope);
                  setEditDepartmentId("");
                }}>
                  {isSuperAdmin && <option value="global">全局公共</option>}
                  {isSuperAdmin && <option value="organization">组织级</option>}
                  <option value="department">部门级</option>
                </select>
              </label>
              {isSuperAdmin && editScope !== "global" && (
                <label>
                  <span>目标组织</span>
                  <select value={editOrgId} onChange={(event) => {
                    setEditOrgId(event.target.value);
                    setEditDepartmentId("");
                  }}>
                    {organizations.length === 0 && <option value="">暂无组织</option>}
                    {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
                  </select>
                </label>
              )}
              {editScope === "department" && (
                <label>
                  <span>目标部门</span>
                  <select value={editDepartmentId} onChange={(event) => setEditDepartmentId(event.target.value)}>
                    {(isSuperAdmin ? editDepartments : departments).length === 0 && <option value="">暂无部门</option>}
                    {(isSuperAdmin ? editDepartments : departments).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                  </select>
                </label>
              )}
              <p className="muted-text">修改可见范围会同步迁移该知识库下已有文档和向量的组织/部门归属。</p>
              <button className="primary-btn" type="submit" disabled={(isSuperAdmin && editScope !== "global" && !editOrgId) || (editScope === "department" && !editDepartmentId)}>保存修改</button>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

function scopeLabel(scope: string) {
  if (scope === "global") return "全局公共";
  if (scope === "organization") return "组织级";
  return "部门级";
}

function ownerLabel(kb: BackendKnowledgeBase) {
  if (kb.scope === "global") return "全系统";
  return kb.target_name || kb.department_name || kb.org_name || "未命名归属";
}

function ownerKey(kb: BackendKnowledgeBase) {
  if (kb.scope === "global") return "global";
  return `${kb.scope ?? "department"}:${kb.target_id || kb.department_id || kb.org_id || ""}`;
}
