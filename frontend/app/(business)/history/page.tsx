"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/hooks";
import type { Role } from "@/features/auth/types";
import { mapBackendRole } from "@/features/auth/utils";
import { HistoryPage } from "@/features/chat/HistoryPage";
import type { HistoryRole } from "@/features/chat/historyTypes";

function HistoryPageContent() {
  const router = useRouter();
  const auth = useAuth();
  const role: Role = auth.user ? mapBackendRole(auth.user.role) : "普通用户";

  return (
    <>

        <HistoryPage
          key={`${auth.user?.id}-${auth.user?.role}-${auth.user?.department_id}`}
          role={(auth.user?.role ?? "user") as HistoryRole}
          departmentName={auth.department?.name ?? "当前部门"}
        />
    </>
  );
}

export default function HistoryRoute() {
  return <HistoryPageContent />;
}
