import { describe, it, expect, afterEach, beforeEach, spyOn } from "bun:test";
import {
  render,
  screen,
  waitFor,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";

import "../i18n";
import { resolveSession } from "../lib/sessionBootstrap";
import * as sessionBootstrap from "../lib/sessionBootstrap";
import * as swControl from "../lib/swControl";
import { apiMock, resetApiMock } from "../test-utils/apiMock";
import type { UserSubscriptions } from "../types";

// A distinct module URL bypasses other files' global Bun AuthContext stubs,
// so these regressions exercise the production provider, including its races.
const productionAuthPath = "./AuthContext.tsx?subscriptions-regression";
const { AuthProvider: ProductionAuthProvider, useAuth: useProductionAuth } =
  (await import(productionAuthPath)) as typeof import("./AuthContext");

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

function SubscriptionState() {
  const { subscriptions, subscriptionsStatus, refreshSubscriptions } =
    useProductionAuth();
  return (
    <>
      <span data-testid="subscriptions-status">{subscriptionsStatus}</span>
      <span data-testid="subscriptions-value">
        {JSON.stringify(subscriptions)}
      </span>
      <button onClick={() => void refreshSubscriptions()}>
        Refresh subscriptions
      </button>
    </>
  );
}

describe("AuthContext production requests", () => {
  let sessionSpy: ReturnType<
    typeof spyOn<typeof sessionBootstrap, "resolveSession">
  >;
  let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
  let clearPrivateDataSpy: ReturnType<
    typeof spyOn<typeof swControl, "clearPrivateData">
  >;

  beforeEach(() => {
    clearPrivateDataSpy = spyOn(
      swControl,
      "clearPrivateData",
    ).mockResolvedValue();
    sessionSpy = spyOn(sessionBootstrap, "resolveSession").mockResolvedValue({
      verdict: "authenticated",
      data: { user: { id: "test-user", username: "test-user" } },
    });
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ local: true, oidc: null }),
    );
  });

  afterEach(() => {
    sessionSpy.mockRestore();
    fetchSpy.mockRestore();
    clearPrivateDataSpy.mockRestore();
    resetApiMock();
  });

  it("shows a themed startup screen until the session is ready", async () => {
    let finishSession!: (
      value: Awaited<ReturnType<typeof resolveSession>>,
    ) => void;
    sessionSpy.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSession = resolve;
        }),
    );
    render(
      <ProductionAuthProvider>
        <SubscriptionState />
      </ProductionAuthProvider>,
    );

    const startup = screen.getByRole("status", { name: "Loading Remindarr" });
    expect(startup.style.background).toBe("var(--bg-app)");
    expect(startup.style.color).toBe("var(--text-app)");
    expect(startup.textContent).toContain("Remindarr");
    expect(screen.queryByTestId("subscriptions-status")).toBeNull();

    await act(async () =>
      finishSession({ verdict: "unauthenticated", data: null }),
    );
    expect(
      screen.queryByRole("status", { name: "Loading Remindarr" }),
    ).toBeNull();
    expect(screen.getByTestId("subscriptions-status").textContent).toBe("idle");
  });

  it("leaves startup when session checks fail without treating the user as signed out", async () => {
    sessionSpy.mockResolvedValue({
      verdict: "indeterminate",
      data: null,
    });
    function SessionState() {
      return (
        <div data-testid="session-status">
          {useProductionAuth().sessionStatus}
        </div>
      );
    }

    render(
      <ProductionAuthProvider>
        <SessionState />
      </ProductionAuthProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("session-status").textContent).toBe("unknown");
    });
    expect(
      screen.queryByRole("status", { name: "Loading Remindarr" }),
    ).toBeNull();
  });

  it("exposes preference failure and recovers after retry without reloading the session", async () => {
    apiMock.getSubscriptions.mockRejectedValueOnce(
      new Error("Preferences unavailable"),
    );
    apiMock.getSubscriptions.mockResolvedValue({
      providerIds: [8],
      onlyMine: true,
    });
    render(
      <ProductionAuthProvider>
        <SubscriptionState />
      </ProductionAuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("subscriptions-status").textContent).toBe(
        "error",
      ),
    );
    expect(screen.getByTestId("subscriptions-value").textContent).toBe("null");
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh subscriptions" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("subscriptions-status").textContent).toBe(
        "success",
      ),
    );
    expect(screen.getByTestId("subscriptions-value").textContent).toBe(
      JSON.stringify({ providerIds: [8], onlyMine: true }),
    );
    expect(apiMock.getSubscriptions).toHaveBeenCalledTimes(2);
    expect(sessionSpy).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending pre-save read and ignores its stale result after a fresh refresh", async () => {
    let resolveOld!: (value: UserSubscriptions) => void;
    apiMock.getSubscriptions.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    apiMock.getSubscriptions.mockResolvedValue({
      providerIds: [8, 337],
      onlyMine: true,
    });
    render(
      <ProductionAuthProvider>
        <SubscriptionState />
      </ProductionAuthProvider>,
    );
    await waitFor(() =>
      expect(apiMock.getSubscriptions).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByTestId("subscriptions-status").textContent).toBe(
      "loading",
    );
    const oldSignal = apiMock.getSubscriptions.mock.calls[0][0] as AbortSignal;
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh subscriptions" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("subscriptions-status").textContent).toBe(
        "success",
      ),
    );
    expect(oldSignal.aborted).toBe(true);
    await act(async () => resolveOld({ providerIds: [], onlyMine: false }));
    expect(screen.getByTestId("subscriptions-value").textContent).toBe(
      JSON.stringify({ providerIds: [8, 337], onlyMine: true }),
    );
    expect(apiMock.getSubscriptions).toHaveBeenCalledTimes(2);
  });
});
