"use client";

import { useState } from "react";
import { LoginPage } from "@/features/auth/LoginPage";
import type { Role } from "@/features/auth/types";

export default function LoginRoute() {
  const [role, setRole] = useState<Role>("部门管理员");

  return (
    <LoginPage
      loginError=""
      onAuthenticated={async () => {}}
      onGoRegister={() => {}}
      role={role}
      setRole={setRole}
    />
  );
}
