"use client";

import React, { useEffect, useState } from "react";
import { Building2, Plus, RefreshCw, Search } from "lucide-react";
import {
  archiveOrganization,
  createOrganization,
  listOrganizations,
  restoreOrganization,
  updateOrganization,
} from "@/features/documents/api";
import type { OrganizationInfo } from "@/features/documents/types";
import { Modal } from "@/components/ui/Modal";
import { ApiError } from "@/types/common";

type OrganizationPanelProps = {
  enabled: boolean;
  onChanged?: () => Promise<void> | void;
};

export function OrganizationPanel({ enabled, onChanged }: OrganizationPanelProps) {
  const [organizations, setOrganizations] = useState<OrganizationInfo[]>([]);
  const [name, setName] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [description, setDescription] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchField, setSearchField] = useState<"all" | "name" | "id" | "description">("all");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingOrg, setEditingOrg] = useState<OrganizationInfo | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const filteredOrganizations = organizations.filter((org) => {
    const keyword = searchKeyword.trim().toLowerCase();
    const description = org.description || "";
    const searchableValues: Record<typeof searchField, string> = {
      all: [org.name, org.id, description].join(" "),
      name: org.name,
      id: org.id,
      description,
    };
    return !keyword || searchableValues[searchField].toLowerCase().includes(keyword);
  });

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled]);

  if (!enabled) {
    return (
      <section className="card">
        <h3>组织管理</h3>
        <div className="empty-table-state">
          <Building2 size={24} />
          <strong>无权限</strong>
          <p>仅超级管理员可以创建和查看组织配置。</p>
        </div>
      </section>
    );
  }

  async function refresh() {
    try {
      setOrganizations(await listOrganizations({ includeArchived: true }));
      setNotice("组织列表已同步。");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "组织列表加载失败。");
    }
  }

  function openEditOrg(org: OrganizationInfo) {
    setEditingOrg(org);
    setEditName(org.name);
    setEditDescription(org.description || "");
  }

  async function submitEditOrg() {
    if (!editingOrg) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setNotice("请填写组织名称。");
      return;
    }
    try {
      await updateOrganization(editingOrg.id, {
        name: trimmedName,
        description: editDescription.trim() || undefined,
      });
      setEditingOrg(null);
      await refresh();
      await onChanged?.();
      setNotice("组织信息已更新。");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "组织更新失败。");
    }
  }

  async function handleArchiveOrg(org: OrganizationInfo) {
    if (!window.confirm(`确认归档组织「${org.name}」？归档后注册、知识库和部门选择入口将不再展示该组织。`)) return;
    try {
      await archiveOrganization(org.id);
      await refresh();
      await onChanged?.();
      setNotice("组织已归档。");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "组织归档失败。");
    }
  }

  async function handleRestoreOrg(org: OrganizationInfo) {
    try {
      await restoreOrganization(org.id);
      await refresh();
      await onChanged?.();
      setNotice("组织已恢复。");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "组织恢复失败。");
    }
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNotice("请填写组织名称。");
      return;
    }
    setIsSubmitting(true);
    try {
      await createOrganization({
        name: trimmedName,
        department_name: departmentName.trim() || undefined,
        description: description.trim() || undefined,
      });
      setName("");
      setDepartmentName("");
      setDescription("");
      await refresh();
      await onChanged?.();
      setNotice("组织创建成功，注册页将可选择该组织。");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "组织创建失败，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="card">
      <div className="card-heading-row">
        <h3>组织管理</h3>
        <button className="secondary-btn" type="button" onClick={refresh}><RefreshCw size={16} />刷新</button>
      </div>
      <div className="admin-kb-layout">
        <form className="admin-kb-form" onSubmit={handleCreate}>
          <label>
            <span>组织名称</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：测试组织 A" />
          </label>
          <label>
            <span>默认部门名称</span>
            <input value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} placeholder="留空则自动创建默认部门" />
          </label>
          <label>
            <span>组织说明</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="可选：用于说明组织用途" />
          </label>
          <button className="primary-btn small" type="submit" disabled={isSubmitting}>
            <Plus size={16} />{isSubmitting ? "创建中..." : "创建组织"}
          </button>
        </form>
        <div className="admin-kb-list">
          <strong><Building2 size={16} />当前组织</strong>
          <div className="admin-table-toolbar">
            <select className="filter-select" value={searchField} onChange={(event) => setSearchField(event.target.value as typeof searchField)}>
              <option value="all">全部字段</option>
              <option value="name">组织名称</option>
              <option value="id">组织ID</option>
              <option value="description">组织说明</option>
            </select>
            <div className="search-box"><Search size={16} /><input value={searchKeyword} onChange={(event) => setSearchKeyword(event.target.value)} placeholder="输入筛选关键词" /></div>
            {(searchKeyword || searchField !== "all") && <button className="secondary-btn" type="button" onClick={() => {
              setSearchKeyword("");
              setSearchField("all");
            }}>清除筛选</button>}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>组织名称</th><th>说明</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                {filteredOrganizations.length === 0 ? (
                  <tr><td colSpan={4}>暂无组织</td></tr>
                ) : filteredOrganizations.map((org) => (
                  <tr className={org.is_archived ? "inactive-row" : ""} key={org.id}>
                    <td>
                      <strong>{org.name}</strong>
                      <small className="table-subtext">{org.id}</small>
                    </td>
                    <td>{org.description || "-"}</td>
                    <td>{org.is_archived ? "已归档" : "启用"}</td>
                    <td>
                      <button className="table-action" disabled={org.is_archived} onClick={() => openEditOrg(org)}>编辑</button>
                      {org.is_archived ? (
                        <button className="table-action" onClick={() => handleRestoreOrg(org)}>恢复</button>
                      ) : (
                        <button className="table-action danger" onClick={() => handleArchiveOrg(org)}>归档</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {notice && <p className="muted-text">{notice}</p>}
      {editingOrg && (
        <Modal>
          <header>
            <div>
              <span>组织配置</span>
              <h3>编辑组织</h3>
            </div>
            <button className="icon-btn" onClick={() => setEditingOrg(null)}>×</button>
          </header>
          <div className="admin-kb-form">
            <label><span>组织名称</span><input value={editName} onChange={(event) => setEditName(event.target.value)} /></label>
            <label><span>组织说明</span><textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} /></label>
            <button className="primary-btn" onClick={submitEditOrg}>保存修改</button>
          </div>
        </Modal>
      )}
    </section>
  );
}
