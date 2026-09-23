"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChangePasswordPage } from "@/features/auth/ChangePasswordPage";
import { useAuth } from "@/features/auth/hooks";

export default function ChangePasswordRoute() {
  const router = useRouter();
  const auth = useAuth();

  useEffect(() => {
    if (auth.status === "unauthenticated") {
      router.replace("/login?redirect=/change-password");
    }
  }, [auth.status, router]);

  async function handleLogout() {
    router.replace("/login");
    await auth.logout().catch(() => {});
  }

  return (
    <ChangePasswordPage
      onLogout={handleLogout}
      onPasswordChanged={() => router.replace("/chat")}
    />
  );
}
