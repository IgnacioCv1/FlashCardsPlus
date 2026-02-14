"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
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

export default function DeckCardsPage() {
  const params = useParams<{ deckId: string }>();
  const deckId = typeof params.deckId === "string" ? params.deckId : "";
  const router = useRouter();
  const { user, isLoading, apiFetch } = useAuth();

  const [deck, setDeck] = useState<DeckDetail | null>(null);
  const [cardQuestion, setCardQuestion] = useState("");
  const [cardAnswer, setCardAnswer] = useState("");
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

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
        setStatusMessage("Could not load cards.");
      }
    })();
  }, [user, deckId]);

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

  function startEdit(card: Card) {
    setEditingCardId(card.id);
    setEditQuestion(card.question);
    setEditAnswer(card.answer);
  }

  function cancelEdit() {
    setEditingCardId(null);
    setEditQuestion("");
    setEditAnswer("");
  }

  async function handleUpdateCard(cardId: string) {
    if (!editQuestion.trim() || !editAnswer.trim()) {
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
          question: editQuestion.trim(),
          answer: editAnswer.trim()
        })
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      cancelEdit();
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

  if (isLoading || !user) {
    return (
      <main style={{ padding: 24, fontFamily: "sans-serif" }}>
        <p>Loading cards...</p>
      </main>
    );
  }

  return (
    <DashboardShell title="Deck Cards" subtitle={deck ? deck.title : "Loading..."}>
      <p>{statusMessage ?? " "}</p>

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, maxWidth: 760 }}>
        <p style={{ marginTop: 0 }}>
          <Link href={`/dashboard/decks/${deckId}`}>Back to Deck Workspace</Link>
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href={`/dashboard/decks/${deckId}/generate`}>Generate From Document</Link>
          <Link href={`/dashboard/study/${deckId}`}>Study Deck</Link>
        </div>
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, maxWidth: 760 }}>
        <h2 style={{ marginTop: 0 }}>Add Card</h2>
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
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, maxWidth: 760 }}>
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
                      value={editQuestion}
                      onChange={(event) => setEditQuestion(event.target.value)}
                      rows={3}
                      disabled={isBusy}
                    />
                    <textarea
                      value={editAnswer}
                      onChange={(event) => setEditAnswer(event.target.value)}
                      rows={4}
                      disabled={isBusy}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={() => void handleUpdateCard(card.id)} disabled={isBusy}>
                        Save
                      </button>
                      <button type="button" onClick={cancelEdit} disabled={isBusy}>
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
                      <button type="button" onClick={() => startEdit(card)} disabled={isBusy}>
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
