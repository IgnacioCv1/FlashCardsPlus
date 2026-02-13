"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchCurrentUser, logoutWithCookieSession, refreshAccessToken, type AuthedUser } from "@/lib/auth-client";
import { apiBaseUrl } from "@/lib/api-config";

interface AuthContextValue {
  user: AuthedUser | null;
  accessToken: string | null;
  isLoading: boolean;
  refreshSession: () => Promise<string | null>;
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthedUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    const token = await refreshAccessToken();
    if (!token) {
      setAccessToken(null);
      setUser(null);
      return null;
    }

    const me = await fetchCurrentUser(token);
    if (!me) {
      setAccessToken(null);
      setUser(null);
      return null;
    }

    setAccessToken(token);
    setUser(me);
    return token;
  }, []);

  const apiFetch = useCallback(
    async (path: string, init: RequestInit = {}) => {
      let token = accessToken ?? (await refreshSession());
      if (!token) {
        return new Response(null, { status: 401, statusText: "Unauthorized" });
      }

      const makeRequest = (access: string) =>
        fetch(`${apiBaseUrl}${path}`, {
          ...init,
          credentials: "include",
          headers: {
            ...(init.headers ?? {}),
            Authorization: `Bearer ${access}`
          }
        });

      let response = await makeRequest(token);
      if (response.status !== 401) {
        return response;
      }

      token = await refreshSession();
      if (!token) {
        return response;
      }

      response = await makeRequest(token);
      return response;
    },
    [accessToken, refreshSession]
  );

  const logout = useCallback(async () => {
    await logoutWithCookieSession();
    setAccessToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await refreshSession();
      } finally {
        setIsLoading(false);
      }
    })();
  }, [refreshSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isLoading,
      refreshSession,
      apiFetch,
      logout
    }),
    [accessToken, apiFetch, isLoading, logout, refreshSession, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
