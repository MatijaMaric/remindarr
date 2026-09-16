import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { authClient } from "../lib/auth-client";
import { createQueryClient } from "../lib/queryClient";
import { AUTH_CHANGE_KEY, cancelIdentityRequests } from "../lib/identity";
import { clearPrivateData } from "../lib/swControl";
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
  signup: (
    username: string,
    email: string,
    password: string,
    name: string,
  ) => Promise<void>;
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

function announceIdentity(
  phase: "changing" | "settled",
  nonce = crypto.randomUUID(),
) {
  try {
    localStorage.setItem(AUTH_CHANGE_KEY, JSON.stringify({ phase, nonce }));
  } catch {
    // Storage-disabled browsers still isolate this tab; focus rechecks the session.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState(() => ({
    user: null as User | null,
    client: createQueryClient(null),
    epoch: 0,
  }));
  const current = useRef(identity);
  const sessionRequest = useRef(0);
  const changing = useRef(false);
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("unknown");
  const [subscriptions, setSubscriptions] = useState<UserSubscriptions | null>(
    null,
  );

  const replaceIdentity = useCallback((user: User | null) => {
    cancelIdentityRequests();
    void current.current.client.cancelQueries();
    current.current.client.clear();
    const next = {
      user,
      client: createQueryClient(user?.id ?? null),
      epoch: current.current.epoch + 1,
    };
    current.current = next;
    setIdentity(next);
    setSubscriptions(null);
    void clearPrivateData();
    return next.epoch;
  }, []);

  const refreshSubscriptions = useCallback(async () => {
    const epoch = current.current.epoch;
    if (!current.current.user) return;
    try {
      const data = await getSubscriptions();
      if (epoch === current.current.epoch) setSubscriptions(data);
    } catch {
      if (epoch === current.current.epoch) setSubscriptions(null);
    }
  }, []);

  const refreshSession = useCallback(
    async (announce = true) => {
      const request = ++sessionRequest.current;
      const epoch = current.current.epoch;
      const { verdict, data } = await resolveSession(() =>
        authClient.getSession({ query: { disableCookieCache: true } }),
      );
      if (request !== sessionRequest.current || epoch !== current.current.epoch)
        return;
      if (verdict !== "indeterminate") {
        const user =
          verdict === "authenticated"
            ? mapSessionToUser(data as BetterAuthSessionData | null)
            : null;
        if (user?.id !== current.current.user?.id) {
          if (announce) announceIdentity("settled");
          replaceIdentity(user);
        } else {
          const next = { ...current.current, user };
          current.current = next;
          setIdentity(next);
        }
        setSessionStatus(user ? "authenticated" : "unauthenticated");
        void refreshSubscriptions();
      }
      setLoading(false);
    },
    [replaceIdentity, refreshSubscriptions],
  );

  const refresh = useCallback(() => refreshSession(), [refreshSession]);
  const cancelRefresh = useCallback(() => {
    ++sessionRequest.current;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void clearPrivateData();
    void refreshSession(false);
    fetch("/api/auth/custom/providers")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setProviders(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      cancelRefresh();
    };
  }, [refreshSession, cancelRefresh]);

  useEffect(() => {
    const unauthorized = () => {
      replaceIdentity(null);
      setSessionStatus("unauthenticated");
      setLoading(false);
      announceIdentity("settled");
    };
    const storage = (event: StorageEvent) => {
      if (event.key !== AUTH_CHANGE_KEY) return;
      replaceIdentity(null);
      setSessionStatus("unknown");
      setLoading(true);
      // Clear immediately, then wait for the cookie-changing operation to finish.
      try {
        changing.current =
          JSON.parse(event.newValue ?? "null")?.phase === "changing";
        if (changing.current) return;
      } catch {
        changing.current = false;
        /* Revalidate malformed/cleared revision markers too. */
      }
      void refreshSession(false);
    };
    const revalidate = () => {
      if (!changing.current) void refreshSession();
    };
    window.addEventListener("auth:unauthorized", unauthorized);
    window.addEventListener("storage", storage);
    window.addEventListener("focus", revalidate);
    window.addEventListener("pageshow", revalidate);
    return () => {
      window.removeEventListener("auth:unauthorized", unauthorized);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("pageshow", revalidate);
    };
  }, [replaceIdentity, refreshSession]);

  const changeSession = async (
    operation: () => Promise<{ error?: { message?: string } | null }>,
  ) => {
    const nonce = crypto.randomUUID();
    changing.current = true;
    announceIdentity("changing", nonce);
    // Keep a signed-out form mounted so it can display failed login/signup
    // errors. A successful identity change remounts the complete private tree.
    if (current.current.user) {
      replaceIdentity(null);
      setLoading(true);
      setSessionStatus("unknown");
    }
    try {
      await clearPrivateData();
      const result = await operation();
      if (result.error)
        throw new Error(result.error.message || "Authentication failed");
    } finally {
      changing.current = false;
      await refreshSession(false);
      announceIdentity("settled", nonce);
    }
  };

  const login = (username: string, password: string) =>
    changeSession(() => authClient.signIn.username({ username, password }));
  const signup = (
    username: string,
    email: string,
    password: string,
    name: string,
  ) =>
    changeSession(() =>
      authClient.signUp.email({ username, email, password, name }),
    );
  const logout = () => changeSession(() => authClient.signOut());

  return (
    <AuthContext
      value={{
        user: identity.user,
        providers,
        loading,
        sessionStatus,
        subscriptions,
        refreshSubscriptions,
        login,
        signup,
        logout,
        refresh,
      }}
    >
      <QueryClientProvider key={identity.epoch} client={identity.client}>
        {loading ? <div role="status">Loading session...</div> : children}
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </AuthContext>
  );
}
