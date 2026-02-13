import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma.js";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export interface CreatedOAuthState {
  rawState: string;
  codeVerifier: string;
}

export function createPkceCodeVerifier(): string {
  return randomBytes(48).toString("base64url");
}

export function createPkceCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function hashState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export async function createOAuthState(client: "web", redirectUri: string): Promise<CreatedOAuthState> {
  const rawState = randomBytes(32).toString("base64url");
  const codeVerifier = createPkceCodeVerifier();
  const stateHash = hashState(rawState);
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);

  await prisma.oAuthState.create({
    data: {
      stateHash,
      codeVerifier,
      client,
      redirectUri,
      expiresAt
    }
  });

  return {
    rawState,
    codeVerifier
  };
}

export async function consumeOAuthState(rawState: string): Promise<{ client: string; redirectUri: string; codeVerifier: string }> {
  const stateHash = hashState(rawState);
  const state = await prisma.oAuthState.findUnique({
    where: { stateHash }
  });

  if (!state || state.consumedAt || state.expiresAt <= new Date()) {
    throw new Error("Invalid OAuth state");
  }

  await prisma.oAuthState.update({
    where: { id: state.id },
    data: {
      consumedAt: new Date()
    }
  });

  return {
    client: state.client,
    redirectUri: state.redirectUri,
    codeVerifier: state.codeVerifier
  };
}
