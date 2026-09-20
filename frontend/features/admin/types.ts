export type AdminStats = {
  users: number;
  departments: number;
  knowledge_bases: number;
  today_tokens: number;
};

export type AdminUserRow = {
  id: string;
  username: string;
  role: string;
  org_id: string;
  department_id: string;
  department_name?: string | null;
  is_active: boolean;
  must_change_password: boolean;
};

export type AdminDepartmentRow = {
  id: string;
  name: string;
  org_id: string;
  description?: string | null;
  is_archived?: boolean;
  archived_at?: string | null;
};
