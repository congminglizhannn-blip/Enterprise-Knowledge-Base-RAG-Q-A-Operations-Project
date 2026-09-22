"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/Spinner";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { useAuth } from "@/features/auth/hooks";
import { toFriendlyError } from "@/lib/errors";
import type { RegisterRequest } from "@/features/auth/types";

export default function RegisterRoute() {
  const router = useRouter();
  const auth = useAuth();
  const [registerError, setRegisterError] = useState("");

  useEffect(() => {
    if (auth.status === "authenticated") {
      if (auth.mustChangePassword) {
        router.replace("/change-password");
      } else {
        router.replace("/chat");
      }
    }
  }, [auth.status, auth.mustChangePassword, router]);

  async function handleRegister(payload: RegisterRequest) {
    setRegisterError("");
    try {
      await auth.register(payload);
    } catch (error) {
      setRegisterError(
        toFriendlyError(
          error,
          "注册失败，请确认用户名未重复、密码不少于 8 位，且已选择有效组织或邀请码。",
        ),
      );
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
    <RegisterPage
      onAuthenticated={handleRegister}
      onBackToLogin={() => router.push("/login")}
      registerError={registerError}
    />
  );
}
