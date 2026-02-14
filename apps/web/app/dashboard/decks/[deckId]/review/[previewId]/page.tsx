"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { useAuth } from "@/components/auth-provider";

interface PreviewCard {
  id: string;
  question: string;
  answer: string;
  position: number;
}

interface IngestionPreview {
  id: string;
  deckId: string;
  filename: string;
  status: "PENDING" | "COMMITTED" | "DISCARDED";
  modelUsed: string;
  expiresAt: string;
  cards: PreviewCard[];
}

interface GetPreviewResponse {
  preview: IngestionPreview;
}

interface CommitPreviewResponse {
  committedCount: number;
  discardedCount: number;
}

interface ReviewCardDecision {
  id: string;
  question: string;
  answer: string;
  keep: boolean;
}

export default function ReviewGeneratedCardsPage() {
  const params = useParams<{ deckId: string; previewId: string }>();
  const deckId = typeof params.deckId === "string" ? params.deckId : "";
  const previewId = typeof params.previewId === "string" ? params.previewId : "";
  const router = useRouter();
  const { user, isLoading, apiFetch } = useAuth();

  const [preview, setPreview] = useState<IngestionPreview | null>(null);
  const [cards, setCards] = useState<ReviewCardDecision[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(true);

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

  async function loadPreview() {
    if (!previewId) {
      return;
    }

    setIsLoadingPreview(true);
    setStatusMessage(null);
    try {
      const response = await apiFetch(`/ingest/previews/${previewId}`);
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = (await response.json()) as GetPreviewResponse;
      if (data.preview.deckId !== deckId) {
        setStatusMessage("Preview does not belong to this deck.");
        setPreview(null);
        setCards([]);
        return;
      }

      setPreview(data.preview);
      setCards(
        data.preview.cards.map((card) => ({
          id: card.id,
          question: card.question,
          answer: card.answer,
          keep: true
        }))
      );
    } catch {
      setStatusMessage("Could not load this generated preview.");
      setPreview(null);
      setCards([]);
    } finally {
      setIsLoadingPreview(false);
    }
  }

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    if (!user || !previewId) {
      return;
    }

    void loadPreview();
  }, [user, previewId]);

  function deleteCard(cardId: string) {
    setCards((current) => current.map((card) => (card.id === cardId ? { ...card, keep: false } : card)));
  }

  function updateCard(cardId: string, patch: Partial<Pick<ReviewCardDecision, "question" | "answer">>) {
    setCards((current) => current.map((card) => (card.id === cardId ? { ...card, ...patch } : card)));
  }

  async function handleSaveReview() {
    if (!preview || cards.length === 0) {
      return;
    }

    setIsApplying(true);
    setStatusMessage(null);
    try {
      const response = await apiFetch(`/ingest/previews/${preview.id}/commit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          cards: cards.map((card) => ({
            id: card.id,
            keep: card.keep,
            question: card.question,
            answer: card.answer
          }))
        })
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      await response.json() as Promise<CommitPreviewResponse>;
      router.push(`/dashboard/decks/${deckId}`);
    } catch {
      setStatusMessage("Could not apply your keep/delete selections.");
      setIsApplying(false);
    }
  }

  async function handleDiscardPreview() {
    if (!preview) {
      router.push(`/dashboard/decks/${deckId}`);
      return;
    }

    setIsApplying(true);
    setStatusMessage(null);
    try {
      const response = await apiFetch(`/ingest/previews/${preview.id}`, {
        method: "DELETE"
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(await readErrorMessage(response));
      }

      router.push(`/dashboard/decks/${deckId}`);
    } catch {
      setStatusMessage("Could not discard this preview.");
      setIsApplying(false);
    }
  }

  if (isLoading || !user) {
    return (
      <main style={{ padding: 24, fontFamily: "sans-serif" }}>
        <p>Loading review page...</p>
      </main>
    );
  }

  const keptCount = cards.filter((card) => card.keep).length;
  const discardedCount = cards.length - keptCount;
  const visibleCards = cards.filter((card) => card.keep);

  return (
    <DashboardShell title="Review Generated Cards" subtitle="Temporary Review Page">
      {statusMessage ? <p>{statusMessage}</p> : null}

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, maxWidth: 900 }}>
        <p style={{ margin: "0 0 6px 0", color: "#dbe7fa" }}>
          Edit any card text below. Use <strong>Delete</strong> only for cards you do not want to keep.
        </p>
        <p style={{ margin: 0, color: "#dbe7fa" }}>
          Kept: {keptCount} • Deleted: {discardedCount}
        </p>
        {preview ? (
          <p style={{ margin: "6px 0 0 0", color: "#dbe7fa" }}>
            Source: {preview.filename} • Model: {preview.modelUsed}
          </p>
        ) : null}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <button type="button" onClick={() => void handleSaveReview()} disabled={isApplying || cards.length === 0}>
            {isApplying ? "Saving..." : "Save Cards"}
          </button>
          <button type="button" onClick={() => void handleDiscardPreview()} disabled={isApplying}>
            Cancel Review
          </button>
        </div>
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, maxWidth: 900 }}>
        {isLoadingPreview ? <p>Loading generated cards...</p> : null}
        {!isLoadingPreview && cards.length === 0 ? <p>No cards available for review.</p> : null}
        {!isLoadingPreview && cards.length > 0 && visibleCards.length === 0 ? (
          <p>All generated cards are currently deleted. Save to continue or cancel review.</p>
        ) : null}

        {!isLoadingPreview && visibleCards.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
            {visibleCards.map((card) => (
              <li key={card.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>
                <div style={{ display: "grid", gap: 8 }}>
                  <textarea
                    value={card.question}
                    onChange={(event) => updateCard(card.id, { question: event.target.value })}
                    rows={3}
                    disabled={isApplying}
                    placeholder="Question"
                  />
                  <textarea
                    value={card.answer}
                    onChange={(event) => updateCard(card.id, { answer: event.target.value })}
                    rows={4}
                    disabled={isApplying}
                    placeholder="Answer"
                  />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button type="button" onClick={() => deleteCard(card.id)} disabled={isApplying}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </DashboardShell>
  );
}
