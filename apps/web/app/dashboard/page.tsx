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

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading, logout, apiFetch } = useAuth();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [deckTitle, setDeckTitle] = useState("");
  const [deckDescription, setDeckDescription] = useState("");
  const [cardQuestion, setCardQuestion] = useState("");
  const [cardAnswer, setCardAnswer] = useState("");
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
  const [editDeckTitle, setEditDeckTitle] = useState("");
  const [editDeckDescription, setEditDeckDescription] = useState("");
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editCardQuestion, setEditCardQuestion] = useState("");
  const [editCardAnswer, setEditCardAnswer] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const activeDeck = useMemo(() => decks.find((deck) => deck.id === activeDeckId) ?? null, [activeDeckId, decks]);

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
      const response = await apiFetch("/decks");
      if (!response.ok) {
        setStatusMessage("Failed to load decks.");
        return;
      }

      const data = (await response.json()) as Deck[];
      setDecks(data);
      if (!activeDeckId && data.length > 0) {
        setActiveDeckId(data[0].id);
      }
    })();
  }, [activeDeckId, apiFetch, user]);

  useEffect(() => {
    if (!activeDeckId) {
      setCards([]);
      return;
    }

    void (async () => {
      const response = await apiFetch(`/decks/${activeDeckId}/cards`);
      if (!response.ok) {
        setStatusMessage("Failed to load cards.");
        return;
      }

      const data = (await response.json()) as Card[];
      setCards(data);
    })();
  }, [activeDeckId, apiFetch]);

  async function refreshDecksAndCards(nextActiveDeckId?: string | null) {
    const decksResponse = await apiFetch("/decks");
    if (!decksResponse.ok) {
      throw new Error("Unable to load decks");
    }
    const nextDecks = (await decksResponse.json()) as Deck[];
    setDecks(nextDecks);

    const deckToUse = nextActiveDeckId ?? (nextDecks.length > 0 ? nextDecks[0].id : null);
    setActiveDeckId(deckToUse);

    if (!deckToUse) {
      setCards([]);
      return;
    }

    const cardsResponse = await apiFetch(`/decks/${deckToUse}/cards`);
    if (!cardsResponse.ok) {
      throw new Error("Unable to load cards");
    }
    const nextCards = (await cardsResponse.json()) as Card[];
    setCards(nextCards);
  }

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
        throw new Error("Failed to create deck");
      }

      const createdDeck = (await response.json()) as Deck;
      setDeckTitle("");
      setDeckDescription("");
      await refreshDecksAndCards(createdDeck.id);
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
        throw new Error("Failed to create card");
      }

      setCardQuestion("");
      setCardAnswer("");
      await refreshDecksAndCards(activeDeckId);
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
        throw new Error("Failed to delete deck");
      }

      const nextDeck = decks.find((deck) => deck.id !== deckId)?.id ?? null;
      await refreshDecksAndCards(nextDeck);
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
        throw new Error("Failed to delete card");
      }

      await refreshDecksAndCards(activeDeckId);
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
        throw new Error("Failed to update deck");
      }

      await refreshDecksAndCards(deckId);
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
        throw new Error("Failed to update card");
      }

      await refreshDecksAndCards(activeDeckId);
      cancelCardEdit();
      setStatusMessage("Card updated.");
    } catch {
      setStatusMessage("Could not update card.");
    } finally {
      setIsBusy(false);
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
