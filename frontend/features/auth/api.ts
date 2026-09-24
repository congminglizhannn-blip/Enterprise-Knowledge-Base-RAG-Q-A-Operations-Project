import { apiJson, clearCsrfToken, ensureCsrfToken, logout as apiLogout } from "@/lib/apiClient";
import type {
  AuthProfile,
  AuthSessionInfo,
  ChangePasswordRequest,
  InviteCreateResponse,
  InviteInfo,
  InviteRole,
  LoginResponse,
  OrganizationInfo,
  RegisterRequest,
  Role,
} from "./types";

export async function login(username: string, password: string, role: Role): Promise<LoginResponse> {
  const backendRoles: Record<Role, InviteRole> = {
    超级管理员: "super_admin",
    部门管理员: "dept_admin",
    普通用户: "user",
  };
  return apiJson<LoginResponse>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, role: backendRoles[role] }),
    skipCsrf: true,
  });
}

export async function register(payload: RegisterRequest): Promise<LoginResponse> {
  return apiJson<LoginResponse>("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    skipCsrf: true,
  });
}

export async function listOrganizations(): Promise<OrganizationInfo[]> {
  return apiJson<OrganizationInfo[]>("/api/organizations", {
    skipAuthRedirect: true,
  });
}

export async function me(): Promise<AuthProfile> {
  return apiJson<AuthProfile>("/api/auth/me", {
    skipAuthRedirect: true,
  });
}

export async function csrf(): Promise<void> {
  await ensureCsrfToken();
}

export async function logout(): Promise<void> {
  try {
    await apiLogout();
  } finally {
    clearCsrfToken();
  }
}

export async function changePassword(payload: ChangePasswordRequest): Promise<LoginResponse> {
  return apiJson<LoginResponse>("/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function listAuthSessions(): Promise<AuthSessionInfo[]> {
  return apiJson<AuthSessionInfo[]>("/api/auth/sessions");
}

export async function revokeAuthSession(sessionId: string): Promise<void> {
  await apiJson<{ success: boolean }>(`/api/auth/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

export async function createInvite(payload: { role: InviteRole; department_id?: string; expires_in_days?: number }): Promise<InviteCreateResponse> {
  return apiJson<InviteCreateResponse>("/api/auth/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function listInvites(): Promise<InviteInfo[]> {
  return apiJson<InviteInfo[]>("/api/auth/invites");
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await apiJson<{ success: boolean }>(`/api/auth/invites/${inviteId}`, {
    method: "DELETE",
  });
}
