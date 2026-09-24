"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/Spinner";
import { LoginPage } from "@/features/auth/LoginPage";
import { useAuth } from "@/features/auth/hooks";
import { toFriendlyError } from "@/lib/errors";
import type { Role } from "@/features/auth/types";

export default function LoginRoute() {
  const router = useRouter();
  const auth = useAuth();
  const [role, setRole] = useState<Role>("普通用户");
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
      await auth.login(username, password, role);
    } catch (error) {
      setLoginError(toFriendlyError(error, "账号或密码错误，请确认后重试。"));
    }
  }

  if (auth.status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (auth.status === "authenticated") {
    return null;
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
