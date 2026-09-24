"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/hooks";
import type { Role } from "@/features/auth/types";
import { mapBackendRole } from "@/features/auth/utils";
import { WorkflowPage } from "@/features/rag/WorkflowPage";

function WorkflowPageContent() {
  const router = useRouter();
  const auth = useAuth();
  const role: Role = auth.user ? mapBackendRole(auth.user.role) : "普通用户";

  return (
    <>

        <WorkflowPage />
    </>
  );
}

export default function WorkflowRoute() {
  return <WorkflowPageContent />;
}
