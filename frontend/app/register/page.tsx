"use client";

import { RegisterPage } from "@/features/auth/RegisterPage";

export default function RegisterRoute() {
  return <RegisterPage onAuthenticated={async () => {}} onBackToLogin={() => {}} registerError="" />;
}
