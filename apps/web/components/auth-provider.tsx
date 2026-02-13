"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchCurrentUser, logoutWithCookieSession, refreshAccessToken, type AuthedUser } from "@/lib/auth-client";

interface AuthContextValue {
  user: AuthedUser | null;
  accessToken: string | null;
  isLoading: boolean;
  refreshSession: () => Promise<boolean>;
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
      return false;
    }

    const me = await fetchCurrentUser(token);
    if (!me) {
      setAccessToken(null);
      setUser(null);
      return false;
    }

    setAccessToken(token);
    setUser(me);
    return true;
  }, []);

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
      logout
    }),
    [accessToken, isLoading, logout, refreshSession, user]
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
