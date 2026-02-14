"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

interface StudySessionCard {
  id: string;
  question: string;
  answer: string;
  scheduleState: {
    dueAt: string;
    lastReviewedAt: string | null;
    intervalMinutes: number;
    repetitions: number;
    easeFactor: number;
  } | null;
}

interface StudySessionResponse {
  deck: {
    id: string;
    title: string;
  };
  dueNowCount: number;
  nextDueAt: string | null;
  cards: StudySessionCard[];
}

type StudyMode = "normal" | "ai";
type ReviewRating = "AGAIN" | "HARD" | "GOOD" | "EASY";

export default function StudyDeckPage() {
  const params = useParams<{ deckId: string }>();
  const deckId = typeof params.deckId === "string" ? params.deckId : "";
  const router = useRouter();
  const { user, isLoading, apiFetch } = useAuth();

  const [mode, setMode] = useState<StudyMode>("normal");
  const [session, setSession] = useState<StudySessionResponse | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const currentCard = useMemo(() => session?.cards[0] ?? null, [session]);

  async function readErrorMessage(response: Response): Promise<string> {
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error && data.error.trim().length > 0) {
        return data.error;
      }
    } catch {
      // Fallback to status text.
    }

    return response.statusText || "Request failed";
  }

  async function loadSession() {
    if (!deckId) {
      return;
    }

    setIsSessionLoading(true);
    setStatusMessage(null);
    try {
      const response = await apiFetch(`/study/decks/${deckId}/session?limit=20`);
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = (await response.json()) as StudySessionResponse;
      setSession(data);
      setIsAnswerRevealed(false);
    } catch {
      setStatusMessage("Could not load study session.");
      setSession(null);
    } finally {
      setIsSessionLoading(false);
    }
  }

  async function submitReview(rating: ReviewRating) {
    if (!currentCard) {
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      const response = await apiFetch("/study/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          cardId: currentCard.id,
          rating
        })
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      await loadSession();
      setStatusMessage(`Saved review: ${rating}.`);
    } catch {
      setStatusMessage("Could not save this review.");
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    if (!user || !deckId) {
      return;
    }

    void loadSession();
  }, [deckId, user]);

  if (isLoading || !user) {
    return (
      <main style={{ padding: 24, fontFamily: "sans-serif" }}>
        <p>Loading study session...</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={() => router.push("/dashboard")}>
          Back to Dashboard
        </button>
        <button type="button" onClick={() => void loadSession()} disabled={isSessionLoading || isSubmitting}>
          Refresh Session
        </button>
      </div>

      <h1>Study</h1>
      <p>Deck: {session?.deck.title ?? "..."}</p>
      <p>{statusMessage ?? " "}</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={() => setMode("normal")} disabled={mode === "normal"}>
          Normal Mode
        </button>
        <button type="button" onClick={() => setMode("ai")} disabled={mode === "ai"}>
          AI Mode
        </button>
      </div>

      {mode === "ai" ? (
        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, maxWidth: 760 }}>
          <h2 style={{ marginTop: 0 }}>AI Mode</h2>
          <p>Coming next. This mode will accept free-text answers and provide AI grading + feedback.</p>
        </section>
      ) : null}

      {mode === "normal" ? (
        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, maxWidth: 760 }}>
          <h2 style={{ marginTop: 0 }}>Normal Mode</h2>
          <p>Due now: {session?.dueNowCount ?? 0}</p>
          <p>
            Next due:{" "}
            {session?.nextDueAt ? new Date(session.nextDueAt).toLocaleString() : "No scheduled reviews yet"}
          </p>

          {isSessionLoading ? <p>Loading cards...</p> : null}

          {!isSessionLoading && !currentCard ? (
            <p>No cards due right now. Come back when more cards are due.</p>
          ) : null}

          {!isSessionLoading && currentCard ? (
            <div style={{ marginTop: 12 }}>
              <p>
                <strong>Question:</strong> {currentCard.question}
              </p>

              {isAnswerRevealed ? (
                <p>
                  <strong>Answer:</strong> {currentCard.answer}
                </p>
              ) : (
                <button type="button" onClick={() => setIsAnswerRevealed(true)} disabled={isSubmitting}>
                  Reveal Answer
                </button>
              )}

              {isAnswerRevealed ? (
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => void submitReview("AGAIN")} disabled={isSubmitting}>
                    Again
                  </button>
                  <button type="button" onClick={() => void submitReview("HARD")} disabled={isSubmitting}>
                    Hard
                  </button>
                  <button type="button" onClick={() => void submitReview("GOOD")} disabled={isSubmitting}>
                    Good
                  </button>
                  <button type="button" onClick={() => void submitReview("EASY")} disabled={isSubmitting}>
                    Easy
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
