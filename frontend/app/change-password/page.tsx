"use client";

import { ChangePasswordPage } from "@/features/auth/ChangePasswordPage";

export default function ChangePasswordRoute() {
  return <ChangePasswordPage onLogout={async () => {}} onPasswordChanged={() => {}} />;
}
