"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshSession } = useAuth();

  useEffect(() => {
    void (async () => {
      const login = searchParams.get("login");
      if (login !== "success") {
        router.replace("/login");
        return;
      }

      const ok = await refreshSession();
      router.replace(ok ? "/dashboard" : "/login");
    })();
  }, [refreshSession, router, searchParams]);

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <p>Completing sign in...</p>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24, fontFamily: "sans-serif" }}>
          <p>Completing sign in...</p>
        </main>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
