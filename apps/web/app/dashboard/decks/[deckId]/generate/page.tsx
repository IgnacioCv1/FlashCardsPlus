"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { useAuth } from "@/components/auth-provider";

interface DeckDetail {
  id: string;
  title: string;
  description: string | null;
  cards: Array<{
    id: string;
  }>;
}

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
  mimeType: string;
  status: "PENDING" | "COMMITTED" | "DISCARDED";
  expiresAt: string;
  createdAt: string;
  plan: "FREE" | "PRO";
  modelUsed: string;
  cards: PreviewCard[];
}

interface GeneratePreviewResponse {
  preview: IngestionPreview;
  generatedCount: number;
  remainingMonthlyDocumentGenerations: number | null;
}

interface GetPreviewResponse {
  preview: IngestionPreview;
}

interface CommitPreviewResponse {
  previewId: string;
  deckId: string;
  committedCount: number;
  discardedCount: number;
}

interface AiSettingsResponse {
  plan: "FREE" | "PRO";
  monthKey: string;
  isUsageLimitBypassed?: boolean;
  models: {
    documentGeneration: string;
    gradingAndChat: string;
  };
  limits: {
    documentGenerations: number | null;
    chatTurns: number | null;
  };
  usage: {
    documentGenerations: number;
    chatTurns: number;
  };
  remaining: {
    documentGenerations: number | null;
    chatTurns: number | null;
  };
}

interface ReviewCard {
  id: string;
  question: string;
  answer: string;
  keep: boolean;
}

export default function DeckGeneratePage() {
  const params = useParams<{ deckId: string }>();
  const deckId = typeof params.deckId === "string" ? params.deckId : "";
  const previewStorageKey = deckId ? `flashcardsplus.preview.${deckId}` : "flashcardsplus.preview";

  const router = useRouter();
  const { user, isLoading, apiFetch } = useAuth();

  const [deck, setDeck] = useState<DeckDetail | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettingsResponse | null>(null);
  const [targetCards, setTargetCards] = useState("");
  const [ingestFile, setIngestFile] = useState<File | null>(null);
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
  const [reviewCards, setReviewCards] = useState<ReviewCard[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplyingReview, setIsApplyingReview] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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

  function persistPreviewReference(preview: IngestionPreview) {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      previewStorageKey,
      JSON.stringify({
        previewId: preview.id
      })
    );
  }

  function clearPreviewReference() {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem(previewStorageKey);
  }

  function setReviewFromPreview(preview: IngestionPreview) {
    setActivePreviewId(preview.id);
    setReviewCards(
      preview.cards.map((card) => ({
        id: card.id,
        question: card.question,
        answer: card.answer,
        keep: true
      }))
    );
  }

  async function loadDeck() {
    if (!deckId) {
      return;
    }

    const response = await apiFetch(`/decks/${deckId}`);
    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    const data = (await response.json()) as DeckDetail;
    setDeck(data);
  }

  async function loadAiSettings() {
    const response = await apiFetch("/ai/settings");
    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }
    const data = (await response.json()) as AiSettingsResponse;
    setAiSettings(data);
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

    void (async () => {
      try {
        await Promise.all([loadDeck(), loadAiSettings()]);
      } catch {
        setStatusMessage("Could not load generation workspace.");
      }
    })();
  }, [user, deckId]);

  useEffect(() => {
    if (!user || typeof window === "undefined" || !deckId) {
      return;
    }

    const raw = window.localStorage.getItem(previewStorageKey);
    if (!raw) {
      return;
    }

    let parsed: { previewId?: string } | null = null;
    try {
      parsed = JSON.parse(raw) as { previewId?: string };
    } catch {
      clearPreviewReference();
      return;
    }

    if (!parsed?.previewId) {
      clearPreviewReference();
      return;
    }

    void (async () => {
      const response = await apiFetch(`/ingest/previews/${parsed.previewId}`);
      if (!response.ok) {
        clearPreviewReference();
        return;
      }

      const data = (await response.json()) as GetPreviewResponse;
      if (data.preview.deckId !== deckId) {
        clearPreviewReference();
        return;
      }
      setReviewFromPreview(data.preview);
    })();
  }, [user, deckId]);

  async function handleGenerateFromDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deckId) {
      return;
    }
    if (!ingestFile) {
      setStatusMessage("Select a PDF or DOCX file.");
      return;
    }

    const targetCardsValue = targetCards.trim();
    let parsedTargetCards: number | null = null;
    if (targetCardsValue.length > 0) {
      parsedTargetCards = Number.parseInt(targetCardsValue, 10);
      if (Number.isNaN(parsedTargetCards) || parsedTargetCards < 1 || parsedTargetCards > 30) {
        setStatusMessage("Target cards must be between 1 and 30.");
        return;
      }
    }

    setIsGenerating(true);
    setStatusMessage(null);
    try {
      const formData = new FormData();
      formData.append("deckId", deckId);
      if (parsedTargetCards !== null) {
        formData.append("targetCards", String(parsedTargetCards));
      }
      formData.append("file", ingestFile);

      const response = await apiFetch("/ingest/generate-preview", {
        method: "POST",
        body: formData
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = (await response.json()) as GeneratePreviewResponse;
      setReviewFromPreview(data.preview);
      persistPreviewReference(data.preview);
      setStatusMessage(`Generated ${data.generatedCount} draft cards with ${data.preview.modelUsed}.`);
      setIngestFile(null);
      const fileInput = document.getElementById("document-upload") as HTMLInputElement | null;
      if (fileInput) {
        fileInput.value = "";
      }
      await loadAiSettings();
    } catch {
      setStatusMessage("Could not generate cards from this document.");
    } finally {
      setIsGenerating(false);
    }
  }

  function updateReviewCard(cardId: string, patch: Partial<ReviewCard>) {
    setReviewCards((current) => current.map((card) => (card.id === cardId ? { ...card, ...patch } : card)));
  }

  async function handleApplyReview() {
    if (!activePreviewId || reviewCards.length === 0) {
      return;
    }

    const invalidKeptCard = reviewCards.find((card) => card.keep && (!card.question.trim() || !card.answer.trim()));
    if (invalidKeptCard) {
      setStatusMessage("Kept cards must have both a question and an answer.");
      return;
    }

    setIsApplyingReview(true);
    setStatusMessage(null);
    try {
      const response = await apiFetch(`/ingest/previews/${activePreviewId}/commit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          cards: reviewCards.map((card) => ({
            id: card.id,
            keep: card.keep,
            question: card.question.trim(),
            answer: card.answer.trim()
          }))
        })
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const commit = (await response.json()) as CommitPreviewResponse;
      setActivePreviewId(null);
      setReviewCards([]);
      clearPreviewReference();
      await Promise.all([loadDeck(), loadAiSettings()]);
      setStatusMessage(`Review saved. Kept ${commit.committedCount} cards, removed ${commit.discardedCount}.`);
    } catch {
      setStatusMessage("Could not apply review decisions.");
    } finally {
      setIsApplyingReview(false);
    }
  }

  async function handleDiscardPreview() {
    if (!activePreviewId) {
      setReviewCards([]);
      clearPreviewReference();
      return;
    }

    setIsApplyingReview(true);
    setStatusMessage(null);
    try {
      const response = await apiFetch(`/ingest/previews/${activePreviewId}`, {
        method: "DELETE"
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(await readErrorMessage(response));
      }

      setActivePreviewId(null);
      setReviewCards([]);
      clearPreviewReference();
      setStatusMessage("Draft preview discarded.");
    } catch {
      setStatusMessage("Could not discard preview.");
    } finally {
      setIsApplyingReview(false);
    }
  }

  if (isLoading || !user) {
    return (
      <main style={{ padding: 24, fontFamily: "sans-serif" }}>
        <p>Loading generation workspace...</p>
      </main>
    );
  }

  return (
    <DashboardShell title="Generate Cards" subtitle={deck ? deck.title : "Loading..."}>
      <p>{statusMessage ?? " "}</p>

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, maxWidth: 760 }}>
        <p style={{ marginTop: 0 }}>
          <Link href={`/dashboard/decks/${deckId}`}>Back to Deck Workspace</Link>
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href={`/dashboard/decks/${deckId}/cards`}>Manage Cards</Link>
          <Link href={`/dashboard/study/${deckId}`}>Study Deck</Link>
        </div>
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, maxWidth: 760 }}>
        <h2 style={{ marginTop: 0 }}>AI Usage</h2>
        {aiSettings ? (
          <div style={{ display: "grid", gap: 6 }}>
            <p style={{ margin: 0 }}>
              <strong>Plan:</strong> {aiSettings.plan}
            </p>
            <p style={{ margin: 0 }}>
              <strong>Document generations:</strong> {aiSettings.usage.documentGenerations} /{" "}
              {aiSettings.limits.documentGenerations === null ? "Unlimited" : aiSettings.limits.documentGenerations}
            </p>
            <p style={{ margin: 0 }}>
              <strong>Remaining this month:</strong>{" "}
              {aiSettings.remaining.documentGenerations === null ? "Unlimited" : aiSettings.remaining.documentGenerations}
            </p>
          </div>
        ) : (
          <p>Loading AI usage...</p>
        )}
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, maxWidth: 760 }}>
        <h2 style={{ marginTop: 0 }}>Generate Draft Cards</h2>
        <form onSubmit={handleGenerateFromDocument} style={{ display: "grid", gap: 8 }}>
          <input
            id="document-upload"
            type="file"
            accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.docx"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setIngestFile(file);
            }}
            disabled={isGenerating}
          />
          <input
            type="number"
            min={1}
            max={30}
            value={targetCards}
            onChange={(event) => setTargetCards(event.target.value)}
            disabled={isGenerating}
            placeholder="Target cards (optional 1-30)"
          />
          <button type="submit" disabled={isGenerating || !ingestFile}>
            {isGenerating ? "Generating..." : "Generate Cards"}
          </button>
        </form>
      </section>

      {reviewCards.length > 0 ? (
        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, maxWidth: 760 }}>
          <h2 style={{ marginTop: 0 }}>Review Draft Cards</h2>
          <p>Keep, edit, or discard cards before they are saved.</p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
            {reviewCards.map((card) => (
              <li key={card.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10, opacity: card.keep ? 1 : 0.6 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={card.keep}
                    onChange={(event) => updateReviewCard(card.id, { keep: event.target.checked })}
                    disabled={isApplyingReview}
                  />
                  Keep card
                </label>
                <textarea
                  value={card.question}
                  onChange={(event) => updateReviewCard(card.id, { question: event.target.value })}
                  rows={3}
                  disabled={!card.keep || isApplyingReview}
                  style={{ width: "100%", marginBottom: 8 }}
                />
                <textarea
                  value={card.answer}
                  onChange={(event) => updateReviewCard(card.id, { answer: event.target.value })}
                  rows={4}
                  disabled={!card.keep || isApplyingReview}
                  style={{ width: "100%" }}
                />
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button type="button" onClick={() => void handleApplyReview()} disabled={isApplyingReview}>
              {isApplyingReview ? "Applying..." : "Apply Review Decisions"}
            </button>
            <button type="button" onClick={() => void handleDiscardPreview()} disabled={isApplyingReview}>
              Discard Draft
            </button>
          </div>
        </section>
      ) : null}
    </DashboardShell>
  );
}
