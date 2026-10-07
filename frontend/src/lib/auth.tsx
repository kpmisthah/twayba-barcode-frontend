"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, getToken, setToken, setUnauthorizedHandler } from "./api";
import type { User } from "./types";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (login: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      return;
    }
    try {
      setUser(await api<User>("/auth/me"));
    } catch {
      logout();
    }
  }, [logout]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    let cancelled = false;
    restoreSession().then((restored) => {
      if (cancelled) return;
      setUser(restored);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      setUnauthorizedHandler(null);
    };
  }, [logout]);

  const login = useCallback(async (loginId: string, password: string) => {
    const res = await api<{ accessToken: string; user: User }>("/auth/login", {
      method: "POST",
      body: { login: loginId, password },
    });
    setToken(res.accessToken);
    setUser(res.user);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh }),
    [user, loading, login, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Loads the logged-in user from a saved token, or null if there is none / it expired. */
async function restoreSession(): Promise<User | null> {
  if (!getToken()) return null;
  try {
    return await api<User>("/auth/me");
  } catch {
    setToken(null);
    return null;
  }
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
