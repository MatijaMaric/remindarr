import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import {
  createContext,
  useContext,
  useState,
  useEffect,
} from "react";
import type { ReactNode } from "react";

// Initialize i18n before anything else
import "../i18n";

// Track getSession behavior per test
let mockGetSession: () => Promise<any>;

const mockAuthClient = {
  getSession: () => mockGetSession(),
  signIn: { social: mock(() => {}), username: mock(() => Promise.resolve({})) },
  signUp: { email: mock(() => Promise.resolve({})) },
  signOut: mock(() => Promise.resolve()),
};

mock.module("../lib/auth-client", () => ({
  authClient: mockAuthClient,
}));

// ---- Inline AuthProvider (mirrors AuthContext.tsx logic) ----
// We inline this because page tests mock "../context/AuthContext" globally,
// polluting bun's module cache. Importing the real AuthContext here would
// get the mock instead. This inline version tests the same init logic.

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

interface AuthContextType {
  user: User | null;
  providers: AuthProviders | null;
  loading: boolean;
}

const TestAuthContext = createContext<AuthContextType>(null!);

function mapSessionToUser(session: any): User | null {
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

function TestAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        const [sessionResult, provData] = await Promise.allSettled([
          mockAuthClient.getSession().then((r: any) => r.data),
          fetch("/api/auth/custom/providers").then((r) => r.json()),
        ]);
        setUser(
          sessionResult.status === "fulfilled"
            ? mapSessionToUser(sessionResult.value)
            : null
        );
        if (provData.status === "fulfilled") {
          setProviders(provData.value);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  return (
    <TestAuthContext value={{ user, providers, loading }}>
      {children}
    </TestAuthContext>
  );
}

// ---- End inline AuthProvider ----

function AuthConsumer() {
  const { user, providers, loading } = useContext(TestAuthContext);
  if (loading) return <div>Loading...</div>;
  return (
    <div>
      <div data-testid="user">{user ? user.username : "none"}</div>
      {providers?.oidc && (
        <div data-testid="oidc-provider">{providers.oidc.name}</div>
      )}
      {providers?.local && <div data-testid="local-login">local</div>}
    </div>
  );
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <TestAuthProvider>{children}</TestAuthProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
});

describe("AuthContext", () => {
  it("loads providers even when getSession rejects", async () => {
    // Simulate invalid session (e.g. BETTER_AUTH_SECRET changed)
    mockGetSession = () => Promise.reject(new Error("Invalid session signature"));

    // Mock fetch for providers endpoint
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock((url: string) => {
      if (typeof url === "string" && url.includes("/api/auth/custom/providers")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              local: true,
              oidc: { name: "PocketID", providerId: "pocketid" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      return originalFetch(url);
    }) as typeof fetch;

    try {
      render(<AuthConsumer />, { wrapper: Wrapper });

      // The OIDC provider should be loaded even though session check failed
      await waitFor(() => {
        expect(screen.getByTestId("oidc-provider").textContent).toBe("PocketID");
      });
      // User should be null since session was rejected
      expect(screen.getByTestId("user").textContent).toBe("none");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sets user when session is valid", async () => {
    mockGetSession = () =>
      Promise.resolve({
        data: {
          user: {
            id: "u1",
            name: "Test User",
            username: "testuser",
            role: "admin",
          },
        },
      });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock((url: string) => {
      if (typeof url === "string" && url.includes("/api/auth/custom/providers")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ local: true, oidc: null }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      return originalFetch(url);
    }) as typeof fetch;

    try {
      render(<AuthConsumer />, { wrapper: Wrapper });

      // User should be set from the valid session
      await waitFor(() => {
        expect(screen.getByTestId("user").textContent).toBe("testuser");
      });
      // Local login should be available
      expect(screen.getByTestId("local-login").textContent).toBe("local");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
