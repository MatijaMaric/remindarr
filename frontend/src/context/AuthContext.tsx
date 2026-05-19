import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { authClient } from "../lib/auth-client";
import { queryClient } from "../lib/queryClient";
import { getSubscriptions } from "../api";
import { resolveSession } from "../lib/sessionBootstrap";
import type { UserSubscriptions } from "../types";

interface User {
  id: string;
  username: string;
  display_name: string | null;
  auth_provider: string;
  is_admin: boolean;
}

interface AuthProviders {
  local: boolean;
  oidc: { name: string; providerId: string } | null;
  passkey?: boolean;
}

export type SessionStatus = "authenticated" | "unauthenticated" | "unknown";

interface AuthContextType {
  user: User | null;
  providers: AuthProviders | null;
  loading: boolean;
  sessionStatus: SessionStatus;
  subscriptions: UserSubscriptions | null;
  refreshSubscriptions: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>(null!);

export function useAuth() {
  return useContext(AuthContext);
}

interface BetterAuthSessionData {
  user?: {
    id: string;
    name?: string | null;
    username?: string | null;
    role?: string | null;
  } | null;
}

function mapSessionToUser(session: BetterAuthSessionData | null): User | null {
  if (!session?.user) return null;
  const u = session.user;
  return {
    id: u.id,
    username: u.username || u.name || "",
    display_name: u.name || null,
    auth_provider: "local",
    is_admin: u.role === "admin",
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("unknown");
  const [subscriptions, setSubscriptions] = useState<UserSubscriptions | null>(null);

  const refreshSubscriptions = useCallback(async () => {
    try {
      const data = await getSubscriptions();
      setSubscriptions(data);
    } catch {
      setSubscriptions(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    const { verdict, data } = await resolveSession(() => authClient.getSession());
    if (verdict === "authenticated") {
      setUser(mapSessionToUser(data as BetterAuthSessionData | null));
      setSessionStatus("authenticated");
    } else if (verdict === "unauthenticated") {
      setUser(null);
      setSessionStatus("unauthenticated");
    }
    // indeterminate: leave current state unchanged
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const [sessionOutcome, provData] = await Promise.allSettled([
        resolveSession(() => authClient.getSession()),
        fetch("/api/auth/custom/providers").then((r) => r.json()),
      ]);

      if (!cancelled) {
        if (sessionOutcome.status === "fulfilled") {
          const { verdict, data } = sessionOutcome.value;
          if (verdict === "authenticated") {
            const resolved = mapSessionToUser(data as BetterAuthSessionData | null);
            setUser(resolved);
            setSessionStatus("authenticated");
            if (resolved) {
              getSubscriptions().then(setSubscriptions).catch(() => {});
            }
          } else if (verdict === "unauthenticated") {
            setUser(null);
            setSessionStatus("unauthenticated");
          } else {
            // indeterminate: leave user null, signal unknown state
            setSessionStatus("unknown");
          }
        }
        if (provData.status === "fulfilled") {
          setProviders(provData.value as AuthProviders);
        }
        setLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // Listen for 401 events from api.ts
  useEffect(() => {
    const handler = () => {
      queryClient.clear();
      setUser(null);
      setSessionStatus("unauthenticated");
    };
    window.addEventListener("auth:unauthorized", handler);
    return () => window.removeEventListener("auth:unauthorized", handler);
  }, []);

  const login = async (username: string, password: string) => {
    const result = await authClient.signIn.username({
      username,
      password,
    });
    if (result.error) {
      throw new Error(result.error.message || "Login failed");
    }
    const session = await authClient.getSession();
    setUser(mapSessionToUser(session.data));
    setSessionStatus("authenticated");
    getSubscriptions().then(setSubscriptions).catch(() => {});

    fetch("/api/auth/custom/providers")
      .then((r) => r.json())
      .then(setProviders)
      .catch(() => {});
  };

  const signup = async (username: string, email: string, password: string, name: string) => {
    const result = await authClient.signUp.email({
      username,
      email,
      password,
      name,
    });
    if (result.error) {
      throw new Error(result.error.message || "Signup failed");
    }
    const session = await authClient.getSession();
    setUser(mapSessionToUser(session.data));
    setSessionStatus("authenticated");
    getSubscriptions().then(setSubscriptions).catch(() => {});
  };

  const logout = async () => {
    await authClient.signOut();
    setUser(null);
    setSessionStatus("unauthenticated");
    setSubscriptions(null);
  };

  return (
    <AuthContext value={{ user, providers, loading, sessionStatus, subscriptions, refreshSubscriptions, login, signup, logout, refresh }}>
      {children}
    </AuthContext>
  );
}
