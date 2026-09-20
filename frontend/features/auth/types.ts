export type UserInfo = {
  id: string;
  username: string;
  role: string;
  org_id: string;
  department_id: string;
  full_name?: string | null;
  must_change_password: boolean;
};

export type OrganizationInfo = {
  id: string;
  name: string;
  created_at?: string;
};

export type DepartmentInfo = {
  id: string;
  name: string;
};

export type AuthProfile = {
  user: UserInfo;
  org: OrganizationInfo;
  department: DepartmentInfo;
};

export type LoginResponse = AuthProfile & {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

export type RegisterRequest = {
  username: string;
  password: string;
  email?: string;
  full_name?: string;
  org_id?: string;
  organization_name?: string;
  department_name?: string;
  invite_code?: string;
};

export type InviteRole = "super_admin" | "dept_admin" | "user";

export type InviteInfo = {
  id: string;
  org_id: string;
  role: InviteRole;
  department_id: string;
  expires_at: string;
  used_by?: string | null;
  used_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
};

export type InviteCreateResponse = InviteInfo & {
  invite_code: string;
  invite_url: string;
};

export type ChangePasswordRequest = {
  current_password: string;
  new_password: string;
};

export type AuthSessionInfo = {
  id: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  absolute_expires_at: string;
  revoked_at?: string | null;
  user_agent?: string | null;
  ip?: string | null;
  is_current: boolean;
};

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";

export type Role = "超级管理员" | "部门管理员" | "普通用户";
