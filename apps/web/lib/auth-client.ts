import { apiBaseUrl } from "./api-config";

export interface AuthedUser {
  id: string;
  email: string | null;
  name: string | null;
}

interface RefreshResponse {
  accessToken: string;
  accessTokenExpiresInSeconds: number;
}

interface MeResponse {
  user: AuthedUser;
}

export async function refreshAccessToken(): Promise<string | null> {
  const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: "{}"
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as RefreshResponse;
  return data.accessToken;
}

export async function fetchCurrentUser(accessToken: string): Promise<AuthedUser | null> {
  const response = await fetch(`${apiBaseUrl}/auth/me`, {
    credentials: "include",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as MeResponse;
  return data.user;
}

export async function logoutWithCookieSession(): Promise<void> {
  await fetch(`${apiBaseUrl}/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: "{}"
  });
}

export function buildGoogleStartUrl(redirectUri?: string): string {
  const url = new URL(`${apiBaseUrl}/auth/google/start`);
  url.searchParams.set("client", "web");
  if (redirectUri) {
    url.searchParams.set("redirect_uri", redirectUri);
  }
  return url.toString();
}
