import request from "supertest";
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { clearRateLimitBuckets } from "../middleware/rate-limit.js";

vi.mock("../auth/google-oauth.js", async () => {
  const actual = await vi.importActual<typeof import("../auth/google-oauth.js")>("../auth/google-oauth.js");
  return {
    ...actual,
    exchangeGoogleCode: vi.fn(async () => ({
      accessToken: "google-access-token",
      idToken: "google-id-token"
    })),
    getGoogleUserFromIdToken: vi.fn(async () => ({
      email: "oauth-user@flashcards.local",
      name: "OAuth User",
      googleSub: "google-sub-1"
    }))
  };
});

interface LoginResponse {
  user: {
    id: string;
    email: string | null;
  };
  accessToken: string;
  refreshToken: string;
}

let app: Express;
let prisma: PrismaClient;

beforeAll(async () => {
  process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "file:./prisma/test.db";
  process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3000";
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "12345678901234567890123456789012";
  process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "12345678901234567890123456789012";
  process.env.JWT_ACCESS_EXPIRES_IN_SECONDS = process.env.JWT_ACCESS_EXPIRES_IN_SECONDS ?? "900";
  process.env.REFRESH_TOKEN_TTL_DAYS = process.env.REFRESH_TOKEN_TTL_DAYS ?? "30";
  process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "test-client";
  process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "test-secret";
  process.env.GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:4000/auth/google/callback";
  process.env.WEB_AUTH_SUCCESS_REDIRECT = process.env.WEB_AUTH_SUCCESS_REDIRECT ?? "http://localhost:3000/auth/callback";
  process.env.WEB_AUTH_FAILURE_REDIRECT = process.env.WEB_AUTH_FAILURE_REDIRECT ?? "http://localhost:3000/login";

  const appModule = await import("../app.js");
  const prismaModule = await import("../lib/prisma.js");
  app = appModule.createApp();
  prisma = prismaModule.prisma;
});

beforeEach(async () => {
  clearRateLimitBuckets();
  await prisma.card.deleteMany();
  await prisma.deck.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.oAuthState.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function loginUser(email: string): Promise<LoginResponse> {
  const response = await request(app).post("/auth/dev-login").send({ email });
  expect(response.status).toBe(201);
  return response.body as LoginResponse;
}

describe("API integration", () => {
  it("rejects protected routes without access token", async () => {
    const response = await request(app).get("/decks");
    expect(response.status).toBe(401);
  });

  it("enforces deck/card ownership between users", async () => {
    const userA = await loginUser("owner-a@test.local");
    const userB = await loginUser("owner-b@test.local");

    const createDeck = await request(app)
      .post("/decks")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        title: "Owner A Deck",
        description: "Private"
      });
    expect(createDeck.status).toBe(201);
    const deckId = (createDeck.body as { id: string }).id;

    const createCard = await request(app)
      .post(`/decks/${deckId}/cards`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        question: "Q1",
        answer: "A1"
      });
    expect(createCard.status).toBe(201);
    const cardId = (createCard.body as { id: string }).id;

    const userBGetDeck = await request(app).get(`/decks/${deckId}`).set("Authorization", `Bearer ${userB.accessToken}`);
    expect(userBGetDeck.status).toBe(404);

    const userBPatchDeck = await request(app)
      .patch(`/decks/${deckId}`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({ title: "Hacked" });
    expect(userBPatchDeck.status).toBe(404);

    const userBDeleteCard = await request(app)
      .delete(`/cards/${cardId}`)
      .set("Authorization", `Bearer ${userB.accessToken}`);
    expect(userBDeleteCard.status).toBe(404);
  });

  it("rotates refresh tokens and rejects reused/revoked tokens", async () => {
    const login = await loginUser("refresh-user@test.local");
    const firstRefreshToken = login.refreshToken;

    const refresh1 = await request(app).post("/auth/refresh").send({ refreshToken: firstRefreshToken });
    expect(refresh1.status).toBe(200);
    const secondRefreshToken = (refresh1.body as { refreshToken: string }).refreshToken;
    expect(secondRefreshToken).toBeTruthy();
    expect(secondRefreshToken).not.toBe(firstRefreshToken);

    const refresh2 = await request(app).post("/auth/refresh").send({ refreshToken: secondRefreshToken });
    expect(refresh2.status).toBe(200);
    const thirdRefreshToken = (refresh2.body as { refreshToken: string }).refreshToken;

    const reusedOldToken = await request(app).post("/auth/refresh").send({ refreshToken: firstRefreshToken });
    expect(reusedOldToken.status).toBe(401);

    const freshChainAttempt = await request(app).post("/auth/refresh").send({ refreshToken: thirdRefreshToken });
    expect(freshChainAttempt.status).toBe(401);

    const secondSession = await loginUser("refresh-user@test.local");
    const secondSessionRefresh1 = await request(app).post("/auth/refresh").send({ refreshToken: secondSession.refreshToken });
    expect(secondSessionRefresh1.status).toBe(200);
    const sessionTwoToken2 = (secondSessionRefresh1.body as { refreshToken: string }).refreshToken;
    const secondSessionRefresh2 = await request(app).post("/auth/refresh").send({ refreshToken: sessionTwoToken2 });
    expect(secondSessionRefresh2.status).toBe(200);
    const sessionTwoToken3 = (secondSessionRefresh2.body as { refreshToken: string }).refreshToken;

    const reusedSecondToken = await request(app).post("/auth/refresh").send({ refreshToken: secondRefreshToken });
    expect(reusedSecondToken.status).toBe(401);

    const familyRevokedAttempt = await request(app).post("/auth/refresh").send({ refreshToken: sessionTwoToken2 });
    expect(familyRevokedAttempt.status).toBe(401);

    const sessionTwoToken3AfterReplay = await request(app).post("/auth/refresh").send({ refreshToken: sessionTwoToken3 });
    expect(sessionTwoToken3AfterReplay.status).toBe(401);
  });

  it("applies auth endpoint rate limits", async () => {
    for (let i = 0; i < 30; i += 1) {
      const response = await request(app).post("/auth/dev-login").send({ email: `rate-${i}@test.local` });
      expect(response.status).toBe(201);
    }

    const throttled = await request(app).post("/auth/dev-login").send({ email: "rate-limit-hit@test.local" });
    expect(throttled.status).toBe(429);
  });

  it("applies refresh endpoint strict limits", async () => {
    const login = await loginUser("refresh-limit@test.local");

    for (let i = 0; i < 19; i += 1) {
      const response = await request(app).post("/auth/refresh").send({ refreshToken: "invalid-token-value" });
      expect(response.status).toBe(401);
    }

    const twentieth = await request(app).post("/auth/refresh").send({ refreshToken: login.refreshToken });
    expect(twentieth.status).toBe(200);

    const throttled = await request(app).post("/auth/refresh").send({ refreshToken: "another-invalid-token-value" });
    expect(throttled.status).toBe(429);
  });

  it("still supports logout for a valid token chain when no replay is detected", async () => {
    const login = await loginUser("logout-user@test.local");
    const refresh1 = await request(app).post("/auth/refresh").send({ refreshToken: login.refreshToken });
    expect(refresh1.status).toBe(200);
    const latestToken = (refresh1.body as { refreshToken: string }).refreshToken;

    const logout = await request(app).post("/auth/logout").send({ refreshToken: latestToken });
    expect(logout.status).toBe(204);

    const refreshAfterLogout = await request(app).post("/auth/refresh").send({ refreshToken: latestToken });
    expect(refreshAfterLogout.status).toBe(401);
  });

  it("prevents OAuth state replay", async () => {
    const start = await request(app).get("/auth/google/start").query({ client: "web" });
    expect(start.status).toBe(302);
    const location = start.headers.location;
    expect(location).toBeTruthy();

    const googleUrl = new URL(location);
    const state = googleUrl.searchParams.get("state");
    expect(state).toBeTruthy();

    const callback1 = await request(app).get("/auth/google/callback").query({ code: "valid-code", state });
    expect(callback1.status).toBe(302);
    expect(callback1.headers.location).toContain("http://localhost:3000/auth/callback");
    expect(callback1.headers["set-cookie"]).toBeDefined();

    const callback2 = await request(app).get("/auth/google/callback").query({ code: "valid-code", state });
    expect(callback2.status).toBe(302);
    expect(callback2.headers.location).toContain("http://localhost:3000/login");
    expect(callback2.headers.location).toContain("Invalid+OAuth+state");
  });
});
