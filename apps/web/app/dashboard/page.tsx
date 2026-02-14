"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

interface Deck {
  id: string;
  title: string;
  description: string | null;
  _count?: {
    cards: number;
  };
}

interface Card {
  id: string;
  question: string;
  answer: string;
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

interface AiSettingsResponse {
  plan: "FREE" | "PRO";
  monthKey: string;
  models: {
    documentGeneration: string;
    gradingAndChat: string;
  };
  limits: {
    documentGenerations: number;
    chatTurns: number;
  };
  usage: {
    documentGenerations: number;
    chatTurns: number;
  };
  remaining: {
    documentGenerations: number;
    chatTurns: number;
  };
}

interface GeneratePreviewResponse {
  preview: IngestionPreview;
  generatedCount: number;
  remainingMonthlyDocumentGenerations: number;
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

interface ReviewCard {
  id: string;
  question: string;
  answer: string;
  keep: boolean;
}

const previewStorageKey = "flashcardsplus.activePreview";

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading, logout, apiFetch } = useAuth();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [aiSettings, setAiSettings] = useState<AiSettingsResponse | null>(null);
  const [deckTitle, setDeckTitle] = useState("");
  const [deckDescription, setDeckDescription] = useState("");
  const [cardQuestion, setCardQuestion] = useState("");
  const [cardAnswer, setCardAnswer] = useState("");
  const [targetCards, setTargetCards] = useState("");
  const [ingestFile, setIngestFile] = useState<File | null>(null);
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
  const [reviewCards, setReviewCards] = useState<ReviewCard[]>([]);
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
  const [editDeckTitle, setEditDeckTitle] = useState("");
  const [editDeckDescription, setEditDeckDescription] = useState("");
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editCardQuestion, setEditCardQuestion] = useState("");
  const [editCardAnswer, setEditCardAnswer] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplyingReview, setIsApplyingReview] = useState(false);

  const activeDeck = useMemo(() => decks.find((deck) => deck.id === activeDeckId) ?? null, [activeDeckId, decks]);

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
        previewId: preview.id,
        deckId: preview.deckId
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

  async function loadDecks(preferredDeckId?: string | null): Promise<string | null> {
    const response = await apiFetch("/decks");
    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    const nextDecks = (await response.json()) as Deck[];
    setDecks(nextDecks);

    const requestedDeckId = preferredDeckId === undefined ? activeDeckId : preferredDeckId;
    const deckToUse =
      requestedDeckId && nextDecks.some((deck) => deck.id === requestedDeckId)
        ? requestedDeckId
        : (nextDecks[0]?.id ?? null);
    setActiveDeckId(deckToUse);
    return deckToUse;
  }

  async function loadCards(deckId: string | null) {
    if (!deckId) {
      setCards([]);
      return;
    }

    const response = await apiFetch(`/decks/${deckId}/cards`);
    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    const nextCards = (await response.json()) as Card[];
    setCards(nextCards);
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
    if (!user) {
      return;
    }

    void (async () => {
      try {
        const deckId = await loadDecks();
        await Promise.all([loadCards(deckId), loadAiSettings()]);
      } catch {
        setStatusMessage("Failed to load dashboard data.");
      }
    })();
  }, [apiFetch, user]);

  useEffect(() => {
    if (!user || typeof window === "undefined") {
      return;
    }

    const raw = window.localStorage.getItem(previewStorageKey);
    if (!raw) {
      return;
    }

    let parsed: { previewId?: string; deckId?: string } | null = null;
    try {
      parsed = JSON.parse(raw) as { previewId?: string; deckId?: string };
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
      setReviewFromPreview(data.preview);
      setActiveDeckId((currentDeckId) => (currentDeckId === data.preview.deckId ? currentDeckId : data.preview.deckId));
    })();
  }, [apiFetch, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    void (async () => {
      try {
        await loadCards(activeDeckId);
      } catch {
        setStatusMessage("Failed to load cards.");
      }
    })();
  }, [activeDeckId, apiFetch, user]);

  async function handleCreateDeck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deckTitle.trim()) {
      return;
    }

    setIsBusy(true);
    setStatusMessage(null);
    try {
      const response = await apiFetch("/decks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: deckTitle.trim(),
          description: deckDescription.trim() || undefined
        })
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const createdDeck = (await response.json()) as Deck;
      setDeckTitle("");
      setDeckDescription("");
      const nextDeckId = await loadDecks(createdDeck.id);
      await loadCards(nextDeckId);
      setStatusMessage("Deck created.");
    } catch {
      setStatusMessage("Could not create deck.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeDeckId || !cardQuestion.trim() || !cardAnswer.trim()) {
      return;
    }

    setIsBusy(true);
    setStatusMessage(null);
    try {
      const response = await apiFetch(`/decks/${activeDeckId}/cards`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question: cardQuestion.trim(),
          answer: cardAnswer.trim()
        })
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setCardQuestion("");
      setCardAnswer("");
      await Promise.all([loadDecks(activeDeckId), loadCards(activeDeckId)]);
      setStatusMessage("Card created.");
    } catch {
      setStatusMessage("Could not create card.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeleteDeck(deckId: string) {
    if (!confirm("Delete this deck and all its cards?")) {
      return;
    }

    setIsBusy(true);
    setStatusMessage(null);
    try {
      const response = await apiFetch(`/decks/${deckId}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const nextDeck = decks.find((deck) => deck.id !== deckId)?.id ?? null;
      const nextDeckId = await loadDecks(nextDeck);
      await loadCards(nextDeckId);
      setStatusMessage("Deck deleted.");
    } catch {
      setStatusMessage("Could not delete deck.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeleteCard(cardId: string) {
    if (!confirm("Delete this card?")) {
      return;
    }

    setIsBusy(true);
    setStatusMessage(null);
    try {
      const response = await apiFetch(`/cards/${cardId}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      await Promise.all([loadDecks(activeDeckId), loadCards(activeDeckId)]);
      setStatusMessage("Card deleted.");
    } catch {
      setStatusMessage("Could not delete card.");
    } finally {
      setIsBusy(false);
    }
  }

  function startDeckEdit(deck: Deck) {
    setEditingDeckId(deck.id);
    setEditDeckTitle(deck.title);
    setEditDeckDescription(deck.description ?? "");
  }

  function cancelDeckEdit() {
    setEditingDeckId(null);
    setEditDeckTitle("");
    setEditDeckDescription("");
  }

  async function handleUpdateDeck(deckId: string) {
    if (!editDeckTitle.trim()) {
      setStatusMessage("Deck title cannot be empty.");
      return;
    }

    setIsBusy(true);
    setStatusMessage(null);
    try {
      const response = await apiFetch(`/decks/${deckId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: editDeckTitle.trim(),
          description: editDeckDescription.trim() || undefined
        })
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      await Promise.all([loadDecks(deckId), loadCards(deckId)]);
      cancelDeckEdit();
      setStatusMessage("Deck updated.");
    } catch {
      setStatusMessage("Could not update deck.");
    } finally {
      setIsBusy(false);
    }
  }

  function startCardEdit(card: Card) {
    setEditingCardId(card.id);
    setEditCardQuestion(card.question);
    setEditCardAnswer(card.answer);
  }

  function cancelCardEdit() {
    setEditingCardId(null);
    setEditCardQuestion("");
    setEditCardAnswer("");
  }

  async function handleUpdateCard(cardId: string) {
    if (!editCardQuestion.trim() || !editCardAnswer.trim()) {
      setStatusMessage("Card question and answer cannot be empty.");
      return;
    }

    setIsBusy(true);
    setStatusMessage(null);
    try {
      const response = await apiFetch(`/cards/${cardId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question: editCardQuestion.trim(),
          answer: editCardAnswer.trim()
        })
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      await Promise.all([loadDecks(activeDeckId), loadCards(activeDeckId)]);
      cancelCardEdit();
      setStatusMessage("Card updated.");
    } catch {
      setStatusMessage("Could not update card.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleGenerateFromDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeDeckId) {
      setStatusMessage("Select a deck first.");
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
      formData.append("deckId", activeDeckId);
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
      if (activeDeckId !== data.preview.deckId) {
        setActiveDeckId(data.preview.deckId);
      }
      await Promise.all([loadDecks(data.preview.deckId), loadCards(data.preview.deckId), loadAiSettings()]);
      setStatusMessage(`Generated ${data.generatedCount} draft cards with ${data.preview.modelUsed}. Review them below.`);
      setIngestFile(null);
      const fileInput = document.getElementById("document-upload") as HTMLInputElement | null;
      if (fileInput) {
        fileInput.value = "";
      }
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
    if (!activePreviewId) {
      setStatusMessage("No active preview to commit.");
      return;
    }

    if (reviewCards.length === 0) {
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

      await Promise.all([loadDecks(commit.deckId), loadCards(commit.deckId), loadAiSettings()]);
      setActiveDeckId(commit.deckId);
      setActivePreviewId(null);
      setReviewCards([]);
      clearPreviewReference();
      setStatusMessage(
        `Review saved. Kept ${commit.committedCount} cards, removed ${commit.discardedCount}.`
      );
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
        <p>Loading dashboard...</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Dashboard</h1>
      <p>Signed in as: {user.email ?? "Unknown user"}</p>
      <p>{statusMessage ?? " "}</p>
      <button
        type="button"
        onClick={async () => {
          await logout();
          router.replace("/login");
        }}
      >
        Sign out
      </button>

      <section style={{ marginTop: 24 }}>
        <h2>AI Settings</h2>
        {aiSettings ? (
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, maxWidth: 640 }}>
            <p>
              <strong>Plan:</strong> {aiSettings.plan}
            </p>
            <p>
              <strong>Document model:</strong> {aiSettings.models.documentGeneration}
            </p>
            <p>
              <strong>Document generations:</strong> {aiSettings.usage.documentGenerations} / {aiSettings.limits.documentGenerations}
            </p>
            <p>
              <strong>Remaining this month:</strong> {aiSettings.remaining.documentGenerations}
            </p>
            <p>
              <strong>Chat turns:</strong> {aiSettings.usage.chatTurns} / {aiSettings.limits.chatTurns}
            </p>
          </div>
        ) : (
          <p>Loading AI settings...</p>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Create Deck</h2>
        <form onSubmit={handleCreateDeck} style={{ display: "grid", gap: 8, maxWidth: 480 }}>
          <input
            value={deckTitle}
            onChange={(event) => setDeckTitle(event.target.value)}
            placeholder="Deck title"
            disabled={isBusy}
          />
          <textarea
            value={deckDescription}
            onChange={(event) => setDeckDescription(event.target.value)}
            placeholder="Deck description (optional)"
            rows={3}
            disabled={isBusy}
          />
          <button type="submit" disabled={isBusy}>
            Add Deck
          </button>
        </form>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Your Decks</h2>
        {decks.length === 0 ? (
          <p>No decks yet.</p>
        ) : (
          <ul style={{ display: "grid", gap: 8, padding: 0, listStyle: "none" }}>
            {decks.map((deck) => (
              <li key={deck.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>
                {editingDeckId === deck.id ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <input
                      value={editDeckTitle}
                      onChange={(event) => setEditDeckTitle(event.target.value)}
                      placeholder="Deck title"
                      disabled={isBusy}
                    />
                    <textarea
                      value={editDeckDescription}
                      onChange={(event) => setEditDeckDescription(event.target.value)}
                      placeholder="Deck description"
                      rows={3}
                      disabled={isBusy}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={() => void handleUpdateDeck(deck.id)} disabled={isBusy}>
                        Save
                      </button>
                      <button type="button" onClick={cancelDeckEdit} disabled={isBusy}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveDeckId(deck.id)}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        display: "block",
                        width: "100%"
                      }}
                    >
                      <strong>{deck.title}</strong>
                      <p>{deck.description ?? "No description"}</p>
                      <p>Cards: {deck._count?.cards ?? 0}</p>
                    </button>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={() => startDeckEdit(deck)} disabled={isBusy}>
                        Edit Deck
                      </button>
                      <button type="button" onClick={() => void handleDeleteDeck(deck.id)} disabled={isBusy}>
                        Delete Deck
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Cards {activeDeck ? `in "${activeDeck.title}"` : ""}</h2>
        {!activeDeck ? <p>Select a deck to view cards.</p> : null}
        {activeDeck ? (
          <>
            <form
              onSubmit={handleGenerateFromDocument}
              style={{ display: "grid", gap: 8, maxWidth: 640, marginBottom: 24, border: "1px solid #ddd", borderRadius: 8, padding: 12 }}
            >
              <h3 style={{ margin: 0 }}>Generate Cards From Document</h3>
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

            {reviewCards.length > 0 ? (
              <section style={{ marginBottom: 24, border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
                <h3 style={{ marginTop: 0 }}>Review AI-generated Cards</h3>
                <p>Uncheck cards to remove them. You can edit kept cards before finalizing.</p>
                <ul style={{ display: "grid", gap: 8, padding: 0, listStyle: "none" }}>
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
                        placeholder="Question"
                        rows={3}
                        disabled={!card.keep || isApplyingReview}
                        style={{ width: "100%", marginBottom: 8 }}
                      />
                      <textarea
                        value={card.answer}
                        onChange={(event) => updateReviewCard(card.id, { answer: event.target.value })}
                        placeholder="Answer"
                        rows={4}
                        disabled={!card.keep || isApplyingReview}
                        style={{ width: "100%" }}
                      />
                    </li>
                  ))}
                </ul>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button type="button" onClick={() => void handleApplyReview()} disabled={isApplyingReview}>
                    {isApplyingReview ? "Applying Review..." : "Apply Review Decisions"}
                  </button>
                  <button type="button" onClick={() => void handleDiscardPreview()} disabled={isApplyingReview}>
                    Dismiss Review
                  </button>
                </div>
              </section>
            ) : null}

            <form onSubmit={handleCreateCard} style={{ display: "grid", gap: 8, maxWidth: 640, marginBottom: 16 }}>
              <textarea
                value={cardQuestion}
                onChange={(event) => setCardQuestion(event.target.value)}
                placeholder="Question"
                rows={3}
                disabled={isBusy}
              />
              <textarea
                value={cardAnswer}
                onChange={(event) => setCardAnswer(event.target.value)}
                placeholder="Answer"
                rows={4}
                disabled={isBusy}
              />
              <button type="submit" disabled={isBusy}>
                Add Card
              </button>
            </form>

            {cards.length === 0 ? (
              <p>No cards in this deck.</p>
            ) : (
              <ul style={{ display: "grid", gap: 8, padding: 0, listStyle: "none" }}>
                {cards.map((card) => (
                  <li key={card.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>
                    {editingCardId === card.id ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        <textarea
                          value={editCardQuestion}
                          onChange={(event) => setEditCardQuestion(event.target.value)}
                          placeholder="Question"
                          rows={3}
                          disabled={isBusy}
                        />
                        <textarea
                          value={editCardAnswer}
                          onChange={(event) => setEditCardAnswer(event.target.value)}
                          placeholder="Answer"
                          rows={4}
                          disabled={isBusy}
                        />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button type="button" onClick={() => void handleUpdateCard(card.id)} disabled={isBusy}>
                            Save
                          </button>
                          <button type="button" onClick={cancelCardEdit} disabled={isBusy}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p>
                          <strong>Q:</strong> {card.question}
                        </p>
                        <p>
                          <strong>A:</strong> {card.answer}
                        </p>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button type="button" onClick={() => startCardEdit(card)} disabled={isBusy}>
                            Edit Card
                          </button>
                          <button type="button" onClick={() => void handleDeleteCard(card.id)} disabled={isBusy}>
                            Delete Card
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </section>
    </main>
  );
}
