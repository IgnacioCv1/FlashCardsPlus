"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
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
    description: string | null;
  };
  dueNowCount: number;
  nextDueAt: string | null;
  cards: StudySessionCard[];
}

interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface StudyGradeResponse {
  cardId: string;
  grading: {
    score: number;
    rating: ReviewRating;
    feedback: string;
    idealAnswer: string;
    assistantReply: string;
  };
  usage: {
    chatTurns: number;
    remainingMonthlyChatTurns: number | null;
  };
}

interface StudyFollowUpResponse {
  cardId: string;
  assistantMessage: string;
  usage: {
    chatTurns: number;
    remainingMonthlyChatTurns: number | null;
  };
}

type StudyMode = "normal" | "ai";
type ReviewRating = "AGAIN" | "HARD" | "GOOD" | "EASY";

export default function StudyDeckPage() {
  const params = useParams<{ deckId: string }>();
  const deckId = typeof params.deckId === "string" ? params.deckId : "";
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, apiFetch } = useAuth();

  const [mode, setMode] = useState<StudyMode>("normal");
  const [session, setSession] = useState<StudySessionResponse | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [aiAnswerInput, setAiAnswerInput] = useState("");
  const [aiFollowUpInput, setAiFollowUpInput] = useState("");
  const [aiSubmittedAnswer, setAiSubmittedAnswer] = useState<string | null>(null);
  const [aiMessages, setAiMessages] = useState<AiChatMessage[]>([]);
  const [aiGradeResult, setAiGradeResult] = useState<StudyGradeResponse["grading"] | null>(null);
  const [aiRemainingTurns, setAiRemainingTurns] = useState<number | "unlimited" | null>(null);
  const [isAiGrading, setIsAiGrading] = useState(false);
  const [isAiFollowUpSending, setIsAiFollowUpSending] = useState(false);

  const currentCard = useMemo(() => session?.cards[0] ?? null, [session]);

  function resetAiState() {
    setAiAnswerInput("");
    setAiFollowUpInput("");
    setAiSubmittedAnswer(null);
    setAiMessages([]);
    setAiGradeResult(null);
    setAiRemainingTurns(null);
    setIsAiGrading(false);
    setIsAiFollowUpSending(false);
  }

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
      resetAiState();
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

  async function submitAiGrade() {
    if (!currentCard) {
      return;
    }

    const answer = aiAnswerInput.trim();
    if (!answer) {
      setStatusMessage("Type your recalled answer before grading.");
      return;
    }

    setIsAiGrading(true);
    setStatusMessage(null);
    try {
      const response = await apiFetch("/study/grade", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          cardId: currentCard.id,
          userAnswer: answer,
          history: aiMessages
        })
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = (await response.json()) as StudyGradeResponse;
      setAiGradeResult(data.grading);
      setAiSubmittedAnswer(answer);
      setAiRemainingTurns(data.usage.remainingMonthlyChatTurns === null ? "unlimited" : data.usage.remainingMonthlyChatTurns);
      setAiMessages((previous) => [
        ...previous,
        { role: "user", content: answer },
        { role: "assistant", content: data.grading.assistantReply }
      ]);
      setAiAnswerInput("");
      setStatusMessage(`AI graded this answer as ${data.grading.rating} (${data.grading.score}/100).`);
    } catch {
      setStatusMessage("Could not grade answer with AI.");
    } finally {
      setIsAiGrading(false);
    }
  }

  async function submitAiFollowUp() {
    if (!currentCard || !aiGradeResult) {
      return;
    }

    const message = aiFollowUpInput.trim();
    if (!message) {
      return;
    }

    setIsAiFollowUpSending(true);
    setStatusMessage(null);
    try {
      const response = await apiFetch("/study/follow-up", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          cardId: currentCard.id,
          userMessage: message,
          history: aiMessages,
          userAnswer: aiSubmittedAnswer ?? undefined,
          feedback: aiGradeResult.feedback,
          idealAnswer: aiGradeResult.idealAnswer
        })
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = (await response.json()) as StudyFollowUpResponse;
      setAiMessages((previous) => [
        ...previous,
        { role: "user", content: message },
        { role: "assistant", content: data.assistantMessage }
      ]);
      setAiRemainingTurns(data.usage.remainingMonthlyChatTurns === null ? "unlimited" : data.usage.remainingMonthlyChatTurns);
      setAiFollowUpInput("");
    } catch {
      setStatusMessage("Could not send follow-up message.");
    } finally {
      setIsAiFollowUpSending(false);
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
      <div className="dashboard-topbar" style={{ marginBottom: 14 }}>
        <Link href="/" className="dashboard-brand">
          <img className="brand-logo" src="/flashcards-plus-logo-white.svg" alt="FlashCards Plus" />
        </Link>
        <nav className="dashboard-nav">
          <Link href="/" className={`dashboard-nav-link${pathname === "/" ? " dashboard-nav-link--active" : ""}`}>
            Home
          </Link>
          <Link
            href="/dashboard"
            className={`dashboard-nav-link${pathname.startsWith("/dashboard") ? " dashboard-nav-link--active" : ""}`}
          >
            Dashboard
          </Link>
          <Link
            href={`/dashboard/decks/${deckId}`}
            className={`dashboard-nav-link${pathname.startsWith(`/dashboard/decks/${deckId}`) ? " dashboard-nav-link--active" : ""}`}
          >
            Deck Workspace
          </Link>
        </nav>
        <div className="dashboard-topbar-actions">
          <button
            type="button"
            onClick={() => void loadSession()}
            disabled={isSessionLoading || isSubmitting || isAiGrading || isAiFollowUpSending}
          >
            Refresh
          </button>
        </div>
      </div>

      <h1>{session?.deck.title ? `Studying ${session.deck.title}` : "Studying"}</h1>
      {session?.deck.description ? <p>{session.deck.description}</p> : null}
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
          <p>Due now: {session?.dueNowCount ?? 0}</p>

          {aiRemainingTurns !== null ? <p>Remaining AI chat turns this month: {aiRemainingTurns === "unlimited" ? "Unlimited" : aiRemainingTurns}</p> : null}

          {isSessionLoading ? <p>Loading cards...</p> : null}

          {!isSessionLoading && !currentCard ? <p>No cards due right now. Come back when more cards are due.</p> : null}

          {!isSessionLoading && currentCard ? (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <p>
                <strong>Question:</strong> {currentCard.question}
              </p>

              {!aiGradeResult ? (
                <>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Your recalled answer</span>
                    <textarea
                      rows={5}
                      value={aiAnswerInput}
                      onChange={(event) => setAiAnswerInput(event.target.value)}
                      placeholder="Type your answer from memory..."
                      disabled={isAiGrading}
                    />
                  </label>
                  <div>
                    <button type="button" onClick={() => void submitAiGrade()} disabled={isAiGrading}>
                      {isAiGrading ? "Grading..." : "Grade Answer"}
                    </button>
                  </div>
                </>
              ) : null}

              {aiGradeResult ? (
                <div className="study-ai-result">
                  <p>
                    <strong>Score:</strong> {aiGradeResult.score}/100 ({aiGradeResult.rating})
                  </p>
                  <p>
                    <strong>Feedback:</strong> {aiGradeResult.feedback}
                  </p>
                  <p>
                    <strong>Ideal answer:</strong> {aiGradeResult.idealAnswer}
                  </p>
                </div>
              ) : null}

              {aiMessages.length > 0 ? (
                <div className="study-ai-chat-log">
                  {aiMessages.map((message, index) => (
                    <p key={`${message.role}-${index}`}>
                      <strong>{message.role === "assistant" ? "AI" : "You"}:</strong> {message.content}
                    </p>
                  ))}
                </div>
              ) : null}

              {aiGradeResult ? (
                <>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Ask follow-up</span>
                    <textarea
                      rows={3}
                      value={aiFollowUpInput}
                      onChange={(event) => setAiFollowUpInput(event.target.value)}
                      placeholder="Ask why an answer was graded this way, request examples, etc."
                      disabled={isAiFollowUpSending}
                    />
                  </label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => void submitAiFollowUp()} disabled={isAiFollowUpSending}>
                      {isAiFollowUpSending ? "Sending..." : "Send Follow-up"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadSession()}
                      disabled={isSessionLoading || isAiGrading || isAiFollowUpSending}
                    >
                      Next Card
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {mode === "normal" ? (
        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, maxWidth: 760 }}>
          <h2 style={{ marginTop: 0 }}>Normal Mode</h2>
          <p>Due now: {session?.dueNowCount ?? 0}</p>

          {isSessionLoading ? <p>Loading cards...</p> : null}

          {!isSessionLoading && !currentCard ? (
            <p>No cards due right now. Come back when more cards are due.</p>
          ) : null}

          {!isSessionLoading && currentCard ? (
            <div style={{ marginTop: 12 }}>
              <div className="study-qa-box">
                <p style={{ margin: "0 0 6px 0" }}>
                  <strong>Question</strong>
                </p>
                <p style={{ margin: 0 }}>{currentCard.question}</p>
              </div>

              {!isAnswerRevealed ? (
                <div style={{ marginTop: 10, marginBottom: 10 }}>
                  <button type="button" onClick={() => setIsAnswerRevealed(true)} disabled={isSubmitting}>
                    Reveal Answer
                  </button>
                </div>
              ) : null}

              {isAnswerRevealed ? (
                <div className="study-qa-box" style={{ marginTop: 10 }}>
                  <p style={{ margin: "0 0 6px 0" }}>
                    <strong>Answer</strong>
                  </p>
                  <p style={{ margin: 0 }}>{currentCard.answer}</p>
                </div>
              ) : null}

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
