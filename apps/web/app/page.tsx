"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth-provider";

export default function HomePage() {
  const { user } = useAuth();

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif", display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <Link href="/" className="dashboard-brand">
          <img className="brand-logo" src="/flashcards-plus-logo-white.svg" alt="FlashCards Plus" />
        </Link>
        {user ? (
          <Link href="/dashboard" className="auth-state-pill">
            Logged In
          </Link>
        ) : (
          <Link href="/login" className="pill-link">
            Login
          </Link>
        )}
      </header>

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, maxWidth: 900 }}>
        <h1 style={{ marginTop: 0 }}>Study smarter with AI-assisted flashcards</h1>
        <p>
          FlashCardsPlus helps you generate flashcards from your documents, review and edit before saving, and study with
          spaced repetition and AI feedback.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/login" className="pill-link pill-link--solid">
            Start Here
          </Link>
          {user ? (
            <Link href="/dashboard" className="pill-link">
              Go to Dashboard
            </Link>
          ) : null}
        </div>
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, maxWidth: 900 }}>
        <h2 style={{ marginTop: 0 }}>How It Works</h2>
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          <li>Create a deck for a topic or course.</li>
          <li>Upload PDF/DOCX or add cards manually.</li>
          <li>Review generated cards before saving.</li>
          <li>Study in normal mode or AI mode with feedback.</li>
        </ol>
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, maxWidth: 900 }}>
        <h2 style={{ marginTop: 0 }}>Plans</h2>
        <div style={{ display: "grid", gap: 12 }}>
          <article style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Free</h3>
            <p style={{ margin: 0 }}>
              Good for trying the product. Includes limited monthly document generations and AI chat turns.
            </p>
          </article>
          <article style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Plus</h3>
            <p style={{ margin: 0 }}>
              Designed for consistent learners. Higher monthly limits for document generation, AI grading, and follow-up
              tutoring.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
