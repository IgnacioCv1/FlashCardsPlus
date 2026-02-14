"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { useAuth } from "@/components/auth-provider";

interface Card {
  id: string;
  question: string;
  answer: string;
}

interface DeckDetail {
  id: string;
  title: string;
  description: string | null;
  cards: Card[];
}

interface IngestionPreview {
  id: string;
  deckId: string;
  modelUsed: string;
}

interface GeneratePreviewResponse {
  preview: IngestionPreview;
  generatedCount: number;
}

export default function DeckWorkspacePage() {
  const params = useParams<{ deckId: string }>();
  const deckId = typeof params.deckId === "string" ? params.deckId : "";
  const router = useRouter();
  const { user, isLoading, apiFetch } = useAuth();

  const [deck, setDeck] = useState<DeckDetail | null>(null);

  const [isEditingDeck, setIsEditingDeck] = useState(false);
  const [editDeckTitle, setEditDeckTitle] = useState("");
  const [editDeckDescription, setEditDeckDescription] = useState("");

  const [cardQuestion, setCardQuestion] = useState("");
  const [cardAnswer, setCardAnswer] = useState("");
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editCardQuestion, setEditCardQuestion] = useState("");
  const [editCardAnswer, setEditCardAnswer] = useState("");

  const [targetCards, setTargetCards] = useState("");
  const [ingestFile, setIngestFile] = useState<File | null>(null);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

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
    setEditDeckTitle(data.title);
    setEditDeckDescription(data.description ?? "");
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
        await loadDeck();
      } catch {
        setStatusMessage("Could not load deck workspace.");
      }
    })();
  }, [user, deckId]);

  async function handleUpdateDeck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deck || !editDeckTitle.trim()) {
      setStatusMessage("Deck title is required.");
      return;
    }

    setIsBusy(true);
    setStatusMessage(null);
    try {
      const response = await apiFetch(`/decks/${deck.id}`, {
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

      await loadDeck();
      setIsEditingDeck(false);
      setStatusMessage("Deck updated.");
    } catch {
      setStatusMessage("Could not update deck.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeleteDeck() {
    if (!deck) {
      return;
    }
    if (!confirm("Delete this deck and all its cards?")) {
      return;
    }

    setIsBusy(true);
    setStatusMessage(null);
    try {
      const response = await apiFetch(`/decks/${deck.id}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      router.push("/dashboard");
    } catch {
      setStatusMessage("Could not delete deck.");
      setIsBusy(false);
    }
  }

  async function handleCreateCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deck || !cardQuestion.trim() || !cardAnswer.trim()) {
      setStatusMessage("Question and answer are required.");
      return;
    }

    setIsBusy(true);
    setStatusMessage(null);
    try {
      const response = await apiFetch(`/decks/${deck.id}/cards`, {
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
      await loadDeck();
      setStatusMessage("Card created.");
    } catch {
      setStatusMessage("Could not create card.");
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
      setStatusMessage("Question and answer are required.");
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

      cancelCardEdit();
      await loadDeck();
      setStatusMessage("Card updated.");
    } catch {
      setStatusMessage("Could not update card.");
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

      await loadDeck();
      setStatusMessage("Card deleted.");
    } catch {
      setStatusMessage("Could not delete card.");
    } finally {
      setIsBusy(false);
    }
  }

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
      router.push(`/dashboard/decks/${deckId}/review/${data.preview.id}`);
    } catch {
      setStatusMessage("Could not generate cards from this document.");
      setIsGenerating(false);
    }
  }

  if (isLoading || !user) {
    return (
      <main style={{ padding: 24, fontFamily: "sans-serif" }}>
        <p>Loading deck workspace...</p>
      </main>
    );
  }

  return (
    <DashboardShell title="Deck Workspace" hideHeading>
      {statusMessage ? <p>{statusMessage}</p> : null}

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, maxWidth: 860 }}>
        {!deck ? (
          <p>Loading deck details...</p>
        ) : !isEditingDeck ? (
          <div style={{ display: "grid", gap: 8 }}>
            <div>
              <h2 style={{ margin: "0 0 4px 0" }}>{deck.title}</h2>
              <p style={{ margin: 0 }}>Deck Workspace</p>
            </div>
            <p style={{ margin: 0 }}>
              <strong>Description:</strong> {deck.description ?? "No description"}
            </p>
            <p style={{ margin: 0 }}>
              <strong>Total cards:</strong> {deck.cards.length}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setIsEditingDeck(true)} disabled={isBusy}>
                Edit Deck
              </button>
              <button type="button" onClick={() => router.push(`/dashboard/study/${deck.id}`)} disabled={isBusy}>
                Study Deck
              </button>
              <button type="button" onClick={() => void handleDeleteDeck()} disabled={isBusy}>
                Delete Deck
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleUpdateDeck} style={{ display: "grid", gap: 8 }}>
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
              <button type="submit" disabled={isBusy}>
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditingDeck(false);
                  if (deck) {
                    setEditDeckTitle(deck.title);
                    setEditDeckDescription(deck.description ?? "");
                  }
                }}
                disabled={isBusy}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, maxWidth: 860 }}>
        <h2 style={{ marginTop: 0 }}>Add Cards</h2>
        <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Manual Entry</h3>
            <form onSubmit={handleCreateCard} style={{ display: "grid", gap: 8 }}>
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
          </div>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Generate From Document</h3>
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
          </div>
        </div>

        <h2 style={{ marginTop: 0 }}>Cards</h2>

        {!deck ? (
          <p>Loading cards...</p>
        ) : deck.cards.length === 0 ? (
          <p>No cards yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
            {deck.cards.map((card) => (
              <li key={card.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>
                {editingCardId === card.id ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <textarea
                      value={editCardQuestion}
                      onChange={(event) => setEditCardQuestion(event.target.value)}
                      rows={3}
                      disabled={isBusy}
                    />
                    <textarea
                      value={editCardAnswer}
                      onChange={(event) => setEditCardAnswer(event.target.value)}
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
                    <p style={{ margin: "0 0 6px 0" }}>
                      <strong>Q:</strong> {card.question}
                    </p>
                    <p style={{ margin: "0 0 10px 0" }}>
                      <strong>A:</strong> {card.answer}
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={() => startCardEdit(card)} disabled={isBusy}>
                        Edit
                      </button>
                      <button type="button" onClick={() => void handleDeleteCard(card.id)} disabled={isBusy}>
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardShell>
  );
}
