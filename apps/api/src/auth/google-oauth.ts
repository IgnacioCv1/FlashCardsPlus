import { URLSearchParams } from "node:url";
import { env } from "../config/env.js";

interface GoogleTokenResponse {
  access_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleTokenInfoResponse {
  sub?: string;
  email?: string;
  email_verified?: "true" | "false";
  name?: string;
}

export function buildGoogleAuthorizationUrl(params: {
  state: string;
  codeChallenge: string;
}): string {
  const search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent"
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${search.toString()}`;
}

export async function exchangeGoogleCode(params: {
  code: string;
  codeVerifier: string;
}): Promise<{ accessToken: string; idToken: string }> {
  const body = new URLSearchParams({
    code: params.code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    grant_type: "authorization_code",
    code_verifier: params.codeVerifier
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const data = (await response.json()) as GoogleTokenResponse;
  if (!response.ok || !data.access_token || !data.id_token) {
    throw new Error(data.error_description ?? data.error ?? "Failed to exchange Google code");
  }

  return {
    accessToken: data.access_token,
    idToken: data.id_token
  };
}

export async function getGoogleUserFromIdToken(idToken: string): Promise<{ email: string; name: string | null; googleSub: string }> {
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
  const response = await fetch(url);
  const data = (await response.json()) as GoogleTokenInfoResponse;
  if (!response.ok || !data.email || data.email_verified !== "true" || !data.sub) {
    throw new Error("Google account email is not verified");
  }

  return {
    email: data.email,
    name: data.name ?? null,
    googleSub: data.sub
  };
}
