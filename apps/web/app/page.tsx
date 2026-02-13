import Link from "next/link";
import { auth } from "@/auth";

export default async function HomePage() {
  const session = await auth();

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Flashcards MVP</h1>
      {session?.user ? (
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
