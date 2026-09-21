"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoginPage } from "@/features/auth/LoginPage";
import { useAuth } from "@/features/auth/hooks";
import { toFriendlyError } from "@/lib/errors";
import type { Role } from "@/features/auth/types";

export default function LoginRoute() {
  const router = useRouter();
  const auth = useAuth();
  const [role, setRole] = useState<Role>("部门管理员");
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    if (auth.status === "authenticated") {
      if (auth.mustChangePassword) {
        router.replace("/change-password");
      } else {
        router.replace("/chat");
      }
    }
  }, [auth.status, auth.mustChangePassword, router]);

  async function handleLogin(username: string, password: string) {
    setLoginError("");
    try {
      await auth.login(username, password);
    } catch (error) {
      setLoginError(toFriendlyError(error, "账号或密码错误，请确认后重试。"));
    }
  }

  return (
    <LoginPage
      loginError={loginError}
      onAuthenticated={handleLogin}
      onGoRegister={() => router.push("/register")}
      role={role}
      setRole={setRole}
    />
  );
}
