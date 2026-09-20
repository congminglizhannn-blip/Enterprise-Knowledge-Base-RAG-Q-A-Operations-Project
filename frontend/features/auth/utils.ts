import type { Role } from "./types";

export function mapBackendRole(role: string): Role {
  if (role === "super_admin") return "超级管理员";
  if (role === "dept_admin") return "部门管理员";
  return "普通用户";
}
