import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { authClient } from "../lib/auth-client";

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
}

interface AuthContextType {
  user: User | null;
  providers: AuthProviders | null;
  loading: boolean;
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
    auth_provider: "local", // better-auth doesn't expose this directly
    is_admin: u.role === "admin",
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const session = await authClient.getSession();
      setUser(mapSessionToUser(session.data));
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    Promise.all([
      authClient.getSession().then((r) => r.data),
      fetch("/api/auth/custom/providers").then((r) => r.json()),
    ])
      .then(([sessionData, provData]) => {
        setUser(mapSessionToUser(sessionData));
        setProviders(provData);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // Listen for 401 events from api.ts
  useEffect(() => {
    const handler = () => setUser(null);
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

    // Refresh providers in case OIDC was configured
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
  };

  const logout = async () => {
    await authClient.signOut();
    setUser(null);
  };

  return (
    <AuthContext value={{ user, providers, loading, login, signup, logout, refresh }}>
      {children}
    </AuthContext>
  );
}
