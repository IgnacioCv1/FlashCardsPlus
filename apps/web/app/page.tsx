"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth-provider";

export default function HomePage() {
  const { user, isLoading } = useAuth();

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Flashcards MVP</h1>
      {isLoading ? (
        <p>Checking session...</p>
      ) : user ? (
        <p>
          You are signed in. Go to <Link href="/dashboard">Dashboard</Link>.
        </p>
      ) : (
        <p>
          You are signed out. Go to <Link href="/login">Login</Link>.
        </p>
      )}
    </main>
  );
}
