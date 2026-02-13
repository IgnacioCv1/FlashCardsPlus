"use client";

import { useMemo } from "react";
import { buildGoogleStartUrl } from "@/lib/auth-client";

export default function LoginPage() {
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
