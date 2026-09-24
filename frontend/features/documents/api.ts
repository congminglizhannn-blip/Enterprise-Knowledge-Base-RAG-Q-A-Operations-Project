import { apiFetch, apiJson } from "@/lib/apiClient";
import type { BackendDocument, BackendKnowledgeBase, DepartmentInfo, DocumentDetail, OrganizationInfo } from "./types";

export function listKnowledgeBases(options?: { includeDisabled?: boolean }) {
  return apiJson<BackendKnowledgeBase[]>(options?.includeDisabled ? "/api/kbs?include_disabled=true" : "/api/kbs");
}

export function listOrganizations(options?: { includeArchived?: boolean }) {
  const query = options?.includeArchived ? "?include_archived=true" : "";
  return apiJson<OrganizationInfo[]>(`/api/organizations${query}`);
}

export function createOrganization(payload: { name: string; description?: string; department_name?: string }) {
  return apiJson<OrganizationInfo & { default_department_id: string; default_department_name: string }>("/api/organizations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateOrganization(organizationId: string, payload: { name: string; description?: string }) {
  return apiJson<OrganizationInfo>(`/api/organizations/${organizationId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function archiveOrganization(organizationId: string) {
  return apiJson<OrganizationInfo>(`/api/organizations/${organizationId}/archive`, { method: "PATCH" });
}

export function restoreOrganization(organizationId: string) {
  return apiJson<OrganizationInfo>(`/api/organizations/${organizationId}/restore`, { method: "PATCH" });
}

export function listDepartments(orgId?: string, options?: { includeArchived?: boolean }) {
  const params = new URLSearchParams();
  if (orgId) params.set("org_id", orgId);
  if (options?.includeArchived) params.set("include_archived", "true");
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiJson<DepartmentInfo[]>(`/api/departments${query}`);
}

export function createDepartment(payload: { org_id?: string; name: string; description?: string }) {
  return apiJson<DepartmentInfo>("/api/departments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateDepartment(departmentId: string, payload: { org_id?: string; name: string; description?: string }) {
  return apiJson<DepartmentInfo>(`/api/departments/${departmentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function archiveDepartment(departmentId: string) {
  return apiJson<DepartmentInfo>(`/api/departments/${departmentId}/archive`, { method: "PATCH" });
}

export function restoreDepartment(departmentId: string) {
  return apiJson<DepartmentInfo>(`/api/departments/${departmentId}/restore`, { method: "PATCH" });
}

export function createKnowledgeBase(payload: { org_id?: string; scope?: "global" | "organization" | "department"; target_id?: string | null; name: string; description: string }) {
  return apiJson<BackendKnowledgeBase>("/api/kbs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateKnowledgeBase(
  knowledgeBaseId: string,
  payload: { name: string; description: string; scope: "global" | "organization" | "department"; target_id?: string | null; org_id?: string },
) {
  return apiJson<BackendKnowledgeBase>(`/api/kbs/${knowledgeBaseId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateKnowledgeBaseStatus(knowledgeBaseId: string, isActive: boolean) {
  return apiJson<BackendKnowledgeBase>(`/api/kbs/${knowledgeBaseId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_active: isActive }),
  });
}

export function deleteDocument(documentId: string) {
  return apiJson<{ message: string }>(`/api/documents/${documentId}`, { method: "DELETE" });
}

export function listDocuments(knowledgeBaseId: string) {
  return apiJson<BackendDocument[]>(`/api/documents?knowledge_base_id=${encodeURIComponent(knowledgeBaseId)}`);
}

export function getDocument(documentId: string) {
  return apiJson<DocumentDetail>(`/api/documents/${documentId}`);
}

export function uploadFile(knowledgeBaseId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiJson<BackendDocument>(`/api/upload/file?knowledge_base_id=${encodeURIComponent(knowledgeBaseId)}`, {
    method: "POST",
    body: formData,
  });
}

export function uploadLink(knowledgeBaseId: string, url: string) {
  return apiJson<BackendDocument>("/api/upload/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ knowledge_base_id: knowledgeBaseId, url }),
  });
}

export function parseDocument(documentId: string) {
  return apiJson<BackendDocument>(`/api/documents/${documentId}/parse`, { method: "POST" });
}

export async function fetchDocumentResponse(documentId: string) {
  return apiFetch(`/api/documents/${documentId}`);
}
