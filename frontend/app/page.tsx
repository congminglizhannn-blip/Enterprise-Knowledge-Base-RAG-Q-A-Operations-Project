"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/features/auth/hooks";
import { ROUTED_VIEWS, type BusinessView } from "@/lib/routing";

function AppContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const urlView = searchParams.get("view");

  useEffect(() => {
    if (auth.status === "loading") return;

    if (auth.status === "unauthenticated") {
      router.replace("/login");
      return;
    }

    if (auth.mustChangePassword) {
      router.replace("/change-password");
      return;
    }

    if (!urlView) {
      router.replace("/chat");
      return;
    }

    if (ROUTED_VIEWS.has(urlView as BusinessView)) {
      router.replace("/" + urlView);
      return;
    }

    router.replace("/chat");
  }, [auth.status, auth.mustChangePassword, urlView, router]);

  return null;
}

export default function App() {
  return (
    <Suspense fallback={null}>
      <AppContent />
    </Suspense>
  );
}
