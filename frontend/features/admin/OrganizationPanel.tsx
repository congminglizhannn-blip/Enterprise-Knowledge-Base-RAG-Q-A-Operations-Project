"use client";

import React, { useEffect, useState } from "react";
import { Building2, Plus, RefreshCw } from "lucide-react";
import { createOrganization, listOrganizations } from "@/features/documents/api";
import type { OrganizationInfo } from "@/features/documents/types";
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
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      setOrganizations(await listOrganizations());
      setNotice("组织列表已同步。");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "组织列表加载失败。");
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
          {organizations.length === 0 ? (
            <p className="muted-text">暂无组织。</p>
          ) : (
            <ul>
              {organizations.map((org) => (
                <li key={org.id}>
                  <span>{org.name}</span>
                  <small>{org.id}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {notice && <p className="muted-text">{notice}</p>}
    </section>
  );
}
