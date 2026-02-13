"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { buildGoogleStartUrl } from "@/lib/auth-client";
import { useAuth } from "@/components/auth-provider";

export default function LoginPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/dashboard");
    }
  }, [isLoading, router, user]);

  const googleUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return buildGoogleStartUrl();
    }
    return buildGoogleStartUrl(`${window.location.origin}/auth/callback`);
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Sign in</h1>
      <p>Use Google to continue.</p>
      <a href={googleUrl}>
        <button type="button">Continue with Google</button>
      </a>
    </main>
  );
}
