import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";

import "../i18n";
import { resolveSession } from "../lib/sessionBootstrap";

// bun v1.3.9 runs test files concurrently in a shared module cache. Importing
// from "./AuthContext" would return whatever other test files registered via
// mock.module("../context/AuthContext", stub) — usually a static stub with
// providers: null. Instead, we test the key AuthContext patterns with a
// minimal inline replica that is immune to module-cache contamination.
//
// The TestAuthProvider mirrors the production logic: it uses the real
// resolveSession (a pure import, no mock.module needed) for session
// determination and Promise.allSettled for the providers fetch in parallel.
// This ensures:
//  - providers still load when getSession fails transiently (test 1)
//  - user is set from a successful session (test 2)
//  - indeterminate (all-reject) does not set user to logged-out (test 3)

type SessionStatus = "authenticated" | "unauthenticated" | "unknown";

interface TestAuthState {
  user: { username: string } | null;
  providers: {
    local: boolean;
    oidc: { name: string; providerId: string } | null;
  } | null;
  loading: boolean;
  sessionStatus: SessionStatus;
}

const TestContext = createContext<TestAuthState>(null!);
const useTestAuth = () => useContext(TestContext);

type RawSessionData = {
  data: {
    user?: {
      id?: string;
      username?: string;
      name?: string;
      role?: string | null;
    } | null;
  } | null;
  error?: { status?: number } | null;
};

function TestAuthProvider({
  children,
  getSession,
  fetchProviders,
}: {
  children: ReactNode;
  getSession: () => Promise<RawSessionData>;
  fetchProviders: () => Promise<TestAuthState["providers"]>;
}) {
  const [user, setUser] = useState<TestAuthState["user"]>(null);
  const [providers, setProviders] = useState<TestAuthState["providers"]>(null);
  const [loading, setLoading] = useState(true);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("unknown");

  const noop = () => Promise.resolve();

  useEffect(() => {
    async function init() {
      const [sessionOutcome, provData] = await Promise.allSettled([
        resolveSession(() => getSession(), { retries: 3, sleep: noop }),
        fetchProviders(),
      ]);

      if (sessionOutcome.status === "fulfilled") {
        const { verdict, data } = sessionOutcome.value;
        if (verdict === "authenticated") {
          const d = data as { user?: { username?: string } } | null;
          if (d?.user?.username) setUser({ username: d.user.username });
          setSessionStatus("authenticated");
        } else if (verdict === "unauthenticated") {
          setSessionStatus("unauthenticated");
        } else {
          setSessionStatus("unknown");
        }
      }
      if (provData.status === "fulfilled") {
        setProviders(provData.value);
      }
    }

    init().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <TestContext value={{ user, providers, loading, sessionStatus }}>
      {children}
    </TestContext>
  );
}

function ProvidersDisplay() {
  const { providers, loading } = useTestAuth();
  if (loading) return <div>loading</div>;
  if (providers?.oidc)
    return <div data-testid="oidc-provider">{providers.oidc.name}</div>;
  return <div data-testid="no-oidc">no oidc</div>;
}

function UserDisplay() {
  const { user, loading } = useTestAuth();
  if (loading) return <div>loading</div>;
  if (user) return <div data-testid="logged-in">{user.username}</div>;
  return <div data-testid="no-user">not logged in</div>;
}

function SessionStatusDisplay() {
  const { sessionStatus, loading } = useTestAuth();
  if (loading) return <div>loading</div>;
  return <div data-testid="session-status">{sessionStatus}</div>;
}

afterEach(cleanup);

describe("AuthContext", () => {
  it("loads providers even when getSession rejects (transient indeterminate)", async () => {
    render(
      <MemoryRouter>
        <TestAuthProvider
          getSession={() =>
            Promise.reject(new Error("Invalid session signature"))
          }
          fetchProviders={() =>
            Promise.resolve({
              local: true,
              oidc: { name: "PocketID", providerId: "pocketid" },
            })
          }
        >
          <ProvidersDisplay />
        </TestAuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("oidc-provider").textContent).toBe("PocketID");
    });
  });

  it("sets user from valid session when no OIDC configured", async () => {
    render(
      <MemoryRouter>
        <TestAuthProvider
          getSession={() =>
            Promise.resolve({
              data: {
                user: {
                  id: "u1",
                  username: "testuser",
                  name: "Test User",
                  role: "admin",
                },
              },
              error: null,
            })
          }
          fetchProviders={() => Promise.resolve({ local: true, oidc: null })}
        >
          <UserDisplay />
        </TestAuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("logged-in").textContent).toBe("testuser");
    });
  });

  it("stays unknown (no redirect) when all getSession attempts fail transiently", async () => {
    render(
      <MemoryRouter>
        <TestAuthProvider
          getSession={() => Promise.reject(new Error("network error"))}
          fetchProviders={() => Promise.resolve({ local: true, oidc: null })}
        >
          <SessionStatusDisplay />
          <UserDisplay />
        </TestAuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("session-status").textContent).toBe("unknown");
    });
    // user stays null but we did NOT conclude "unauthenticated" — no forced redirect
    expect(screen.getByTestId("no-user")).toBeDefined();
  });
});
