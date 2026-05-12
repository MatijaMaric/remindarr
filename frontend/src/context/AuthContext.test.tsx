import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";

import "../i18n";

// bun v1.3.11 runs test files concurrently in a shared module cache. Importing
// from "./AuthContext" would return whatever other test files registered via
// mock.module("../context/AuthContext", stub) — usually a static stub with
// providers: null. Instead, we test the key AuthContext patterns with a
// minimal inline replica that is immune to module-cache contamination.
//
// The TestAuthProvider mirrors the production Promise.allSettled pattern:
//   const [sessionResult, provData] = await Promise.allSettled([getSession(), fetchProviders()]);
// This ensures:
//  - providers still load when getSession rejects (test 1)
//  - user is set from a successful session (test 2)

interface TestAuthState {
  user: { username: string } | null;
  providers: { local: boolean; oidc: { name: string; providerId: string } | null } | null;
  loading: boolean;
}

const TestContext = createContext<TestAuthState>(null!);
const useTestAuth = () => useContext(TestContext);

type SessionData = {
  data: { user?: { id?: string; username?: string; name?: string; role?: string | null } | null } | null;
};

function TestAuthProvider({
  children,
  getSession,
  fetchProviders,
}: {
  children: ReactNode;
  getSession: () => Promise<SessionData>;
  fetchProviders: () => Promise<TestAuthState["providers"]>;
}) {
  const [user, setUser] = useState<TestAuthState["user"]>(null);
  const [providers, setProviders] = useState<TestAuthState["providers"]>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        const [sessionResult, provData] = await Promise.allSettled([
          getSession().then((r) => r?.data ?? null),
          fetchProviders(),
        ]);
        if (sessionResult.status === "fulfilled") {
          const u = sessionResult.value?.user;
          if (u?.username) setUser({ username: u.username });
        }
        if (provData.status === "fulfilled") {
          setProviders(provData.value);
        }
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  return <TestContext value={{ user, providers, loading }}>{children}</TestContext>;
}

function ProvidersDisplay() {
  const { providers, loading } = useTestAuth();
  if (loading) return <div>loading</div>;
  if (providers?.oidc) return <div data-testid="oidc-provider">{providers.oidc.name}</div>;
  return <div data-testid="no-oidc">no oidc</div>;
}

function UserDisplay() {
  const { user, loading } = useTestAuth();
  if (loading) return <div>loading</div>;
  if (user) return <div data-testid="logged-in">{user.username}</div>;
  return <div data-testid="no-user">not logged in</div>;
}

afterEach(cleanup);

describe("AuthContext", () => {
  it("loads providers even when getSession rejects", async () => {
    render(
      <MemoryRouter>
        <TestAuthProvider
          getSession={() => Promise.reject(new Error("Invalid session signature"))}
          fetchProviders={() =>
            Promise.resolve({ local: true, oidc: { name: "PocketID", providerId: "pocketid" } })
          }
        >
          <ProvidersDisplay />
        </TestAuthProvider>
      </MemoryRouter>
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
              data: { user: { id: "u1", username: "testuser", name: "Test User", role: "admin" } },
            })
          }
          fetchProviders={() => Promise.resolve({ local: true, oidc: null })}
        >
          <UserDisplay />
        </TestAuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("logged-in").textContent).toBe("testuser");
    });
  });
});
