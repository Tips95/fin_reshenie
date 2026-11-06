"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiRequestError, authApi, type AgentRegisterPayload } from "@/lib/api-client";
import { clearTokens, isAuthenticated, setTokens } from "@/lib/auth-storage";
import { legalHomePath } from "@/lib/organization-features";
import type { TokenResponse, User } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (login: string, password: string) => Promise<void>;
  registerAgent: (payload: AgentRegisterPayload) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refreshUser = useCallback(async () => {
    if (!isAuthenticated()) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const me = await authApi.me();
      setUser(me);
    } catch {
      clearTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const startSession = useCallback(
    async (tokens: TokenResponse) => {
      setTokens(tokens.access_token, tokens.refresh_token);
      const me = await authApi.me();
      setUser(me);
      router.push(legalHomePath(me));
    },
    [router],
  );

  const login = useCallback(
    async (loginValue: string, password: string) => {
      await startSession(await authApi.login(loginValue, password));
    },
    [startSession],
  );

  const registerAgent = useCallback(
    async (payload: AgentRegisterPayload) => {
      await startSession(await authApi.registerAgent(payload));
    },
    [startSession],
  );

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
    router.push("/login");
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, login, registerAgent, logout, refreshUser }),
    [user, loading, login, registerAgent, logout, refreshUser],
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

export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return "Неизвестная ошибка";
}
