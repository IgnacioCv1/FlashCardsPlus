"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { useAuth } from "@/components/auth-provider";

interface Deck {
  id: string;
  title: string;
  description: string | null;
  _count?: {
    cards: number;
  };
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

interface DeckStudySummary {
  dueNowCount: number;
  nextDueAt: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading, apiFetch } = useAuth();

  const [decks, setDecks] = useState<Deck[]>([]);
  const [deckStudyById, setDeckStudyById] = useState<Record<string, DeckStudySummary>>({});
  const [aiSettings, setAiSettings] = useState<AiSettingsResponse | null>(null);
  const [deckTitle, setDeckTitle] = useState("");
  const [deckDescription, setDeckDescription] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const fullDisplayName =
    user?.name?.trim() ||
    user?.email?.split("@")[0]?.trim() ||
    "there";
  const firstName = fullDisplayName.split(/\s+/)[0] || fullDisplayName;

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

  async function loadData() {
    const [decksResponse, aiSettingsResponse] = await Promise.all([apiFetch("/decks"), apiFetch("/ai/settings")]);
    if (!decksResponse.ok) {
      throw new Error(await readErrorMessage(decksResponse));
    }
    if (!aiSettingsResponse.ok) {
      throw new Error(await readErrorMessage(aiSettingsResponse));
    }

    const [decksData, aiSettingsData] = await Promise.all([
      decksResponse.json() as Promise<Deck[]>,
      aiSettingsResponse.json() as Promise<AiSettingsResponse>
    ]);
    setDecks(decksData);
    setAiSettings(aiSettingsData);
    await loadDeckStudySummaries(decksData);
  }

  async function loadDeckStudySummaries(nextDecks: Deck[]) {
    if (nextDecks.length === 0) {
      setDeckStudyById({});
      return;
    }

    const summaryEntries = await Promise.all(
      nextDecks.map(async (deck) => {
        try {
          const response = await apiFetch(`/study/decks/${deck.id}/session?limit=1`);
          if (!response.ok) {
            return [deck.id, null] as const;
          }

          const data = (await response.json()) as DeckStudySummary;
          return [
            deck.id,
            {
              dueNowCount: data.dueNowCount,
              nextDueAt: data.nextDueAt
            }
          ] as const;
        } catch {
          return [deck.id, null] as const;
        }
      })
    );

    const nextStudyById: Record<string, DeckStudySummary> = {};
    for (const [deckId, summary] of summaryEntries) {
      if (summary) {
        nextStudyById[deckId] = summary;
      }
    }
    setDeckStudyById(nextStudyById);
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
        await loadData();
      } catch {
        setStatusMessage("Failed to load dashboard data.");
      }
    })();
  }, [user]);

  async function handleCreateDeck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deckTitle.trim()) {
      setStatusMessage("Deck title is required.");
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

      const created = (await response.json()) as Deck;
      setDeckTitle("");
      setDeckDescription("");
      await loadData();
      setStatusMessage("Deck created.");
      router.push(`/dashboard/decks/${created.id}`);
    } catch {
      setStatusMessage("Could not create deck.");
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

      await loadData();
      setStatusMessage("Deck deleted.");
    } catch {
      setStatusMessage("Could not delete deck.");
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
    <DashboardShell
      title={`Welcome, ${firstName}`}
      subtitle="Dashboard"
      meta={
        aiSettings ? (
          <div className="dashboard-meta">
            <span className="dashboard-meta-item">
              <strong>Plan</strong> {aiSettings.plan}
              <span className="info-dot" title="Your current subscription tier.">
                i
              </span>
            </span>
            <span className="dashboard-meta-item">
              <strong>Docs left</strong>{" "}
              {aiSettings.remaining.documentGenerations === null ? "Unlimited" : aiSettings.remaining.documentGenerations}
              <span
                className="info-dot"
                title="How many document generations you can run this month before reaching your plan limit."
              >
                i
              </span>
            </span>
            <span className="dashboard-meta-item">
              <strong>Chat left</strong> {aiSettings.remaining.chatTurns === null ? "Unlimited" : aiSettings.remaining.chatTurns}
              <span
                className="info-dot"
                title="How many AI study chat turns remain this month. Grading and follow-up both use chat turns."
              >
                i
              </span>
            </span>
          </div>
        ) : (
          <p style={{ margin: 0 }}>Loading plan...</p>
        )
      }
    >
      {statusMessage ? <p>{statusMessage}</p> : null}

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, maxWidth: 760 }}>
        <h2 style={{ marginTop: 0 }}>Create Deck</h2>
        <form onSubmit={handleCreateDeck} style={{ display: "grid", gap: 8 }}>
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
            Create Deck
          </button>
        </form>
      </section>

      {decks.length > 0 ? (
        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, maxWidth: 760 }}>
          <h2 style={{ marginTop: 0 }}>Your Decks</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
            {decks.map((deck) => (
              <li
                key={deck.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/dashboard/decks/${deck.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(`/dashboard/decks/${deck.id}`);
                  }
                }}
                style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10, cursor: "pointer" }}
              >
                {(() => {
                  const study = deckStudyById[deck.id];
                  return (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div>
                    <p style={{ margin: "0 0 4px 0" }}>
                      <strong>{deck.title}</strong>
                    </p>
                    <p style={{ margin: "0 0 8px 0" }}>{deck.description ?? "No description"}</p>
                    <div style={{ marginTop: 14 }}>
                      <p style={{ margin: 0 }}>Cards: {deck._count?.cards ?? 0}</p>
                      <p style={{ margin: "4px 0 0 0" }}>Due now: {study ? study.dueNowCount : "..."}</p>
                      <p style={{ margin: "4px 0 0 0" }}>
                        Next due: {study ? (study.nextDueAt ? new Date(study.nextDueAt).toLocaleString() : "No scheduled reviews") : "..."}
                      </p>
                    </div>
                  </div>
                  <button
                    className="deck-delete-button"
                    aria-label={`Delete ${deck.title}`}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDeleteDeck(deck.id);
                    }}
                    disabled={isBusy}
                  >
                    <span className="deck-delete-glyph" aria-hidden="true">
                      ×
                    </span>
                  </button>
                </div>
                  );
                })()}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      router.push(`/dashboard/decks/${deck.id}`);
                    }}
                    disabled={isBusy}
                  >
                    Open Workspace
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      router.push(`/dashboard/study/${deck.id}`);
                    }}
                    disabled={isBusy}
                  >
                    Study Deck
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </DashboardShell>
  );
}
