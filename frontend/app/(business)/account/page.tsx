"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { SessionsPanel } from "@/features/auth/SessionsPanel";
import { useAuth } from "@/features/auth/hooks";
import type { Role } from "@/features/auth/types";
import { mapBackendRole } from "@/features/auth/utils";

function AccountPageContent() {
  const router = useRouter();
  const auth = useAuth();
  const role: Role = auth.user ? mapBackendRole(auth.user.role) : "普通用户";

  return (
    <>

        <SessionsPanel />
    </>
  );
}

export default function AccountRoute() {
  return <AccountPageContent />;
}
