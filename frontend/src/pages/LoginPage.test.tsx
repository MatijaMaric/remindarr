import { describe, it, expect, mock, afterEach, beforeEach } from "bun:test";
import {
  render,
  screen,
  waitFor,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { createContext, useContext, useEffect, useState } from "react";

import "../i18n";

type PasskeyError = { code?: string; message?: string; status?: number };
type PasskeyResult = { data: unknown; error: PasskeyError | null };
type SessionResult = {
  data: {
    user: {
      id: string;
      name?: string;
      username?: string;
      role?: string | null;
    };
  } | null;
};

let mockPasskeySignIn: (opts?: {
  autoFill?: boolean;
}) => Promise<PasskeyResult>;
let mockGetSession: () => Promise<SessionResult>;
const mockSocialSignIn = mock((_opts: unknown) => {});

mock.module("../lib/auth-client", () => ({
  authClient: {
    getSession: () => mockGetSession(),
    signIn: {
      passkey: (opts?: { autoFill?: boolean }) => mockPasskeySignIn(opts),
      username: mock(() => Promise.resolve({ data: null, error: null })),
      social: (opts: unknown) => mockSocialSignIn(opts),
    },
    signUp: { email: mock(() => Promise.resolve({})) },
    signOut: mock(() => Promise.resolve()),
  },
}));

// Mock useAuth directly so this test is immune to AuthContext mock.module
// leakage from sibling test files.
const MockAuthContext = createContext<any>(null);
mock.module("../context/AuthContext", () => ({
  useAuth: () =>
    useContext(MockAuthContext) ?? {
      user: null,
      providers: { local: true, oidc: null, passkey: true },
      loading: false,
      sessionStatus: "authenticated",
      login: () => Promise.resolve(),
      signup: () => Promise.resolve(),
      logout: () => Promise.resolve(),
      refresh: () => Promise.resolve(),
    },
  AuthContext: MockAuthContext,
  // AuthProvider export preserved so sibling test files that import it from
  // the same cached module don't get "Export named 'AuthProvider' not found".
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const { default: LoginPage } = await import("./LoginPage");

const originalPublicKeyCredential = (
  globalThis as unknown as { PublicKeyCredential?: unknown }
).PublicKeyCredential;

beforeEach(() => {
  // Make isWebAuthnSupported() true without triggering conditional mediation.
  (
    globalThis as unknown as { PublicKeyCredential: unknown }
  ).PublicKeyCredential = {
    isConditionalMediationAvailable: () => Promise.resolve(false),
  };
  mockGetSession = () => Promise.resolve({ data: null });
});

afterEach(() => {
  cleanup();
  if (originalPublicKeyCredential === undefined) {
    delete (globalThis as unknown as { PublicKeyCredential?: unknown })
      .PublicKeyCredential;
  } else {
    (
      globalThis as unknown as { PublicKeyCredential: unknown }
    ).PublicKeyCredential = originalPublicKeyCredential;
  }
});

describe("LoginPage passkey sign-in", () => {
  it("does not show an error when the passkey prompt is cancelled (AUTH_CANCELLED)", async () => {
    mockPasskeySignIn = () =>
      Promise.resolve({
        data: null,
        error: {
          code: "AUTH_CANCELLED",
          message: "AUTH_CANCELLED",
          status: 400,
        },
      });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const button = await screen.findByRole("button", {
      name: /sign in with passkey/i,
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect((button as HTMLButtonElement).disabled).toBe(false);
    });

    expect(screen.queryByText(/AUTH_CANCELLED/)).toBeNull();
  });

  it("shows a real error message when passkey sign-in fails for other reasons", async () => {
    mockPasskeySignIn = () =>
      Promise.resolve({
        data: null,
        error: {
          code: "INVALID_CHALLENGE",
          message: "Challenge expired",
          status: 400,
        },
      });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const button = await screen.findByRole("button", {
      name: /sign in with passkey/i,
    });
    fireEvent.click(button);

    expect(await screen.findByText(/Challenge expired/)).toBeDefined();
  });

  it("falls back to the localized message when error message is empty", async () => {
    mockPasskeySignIn = () =>
      Promise.resolve({
        data: null,
        error: { code: "UNKNOWN", message: "", status: 400 },
      });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const button = await screen.findByRole("button", {
      name: /sign in with passkey/i,
    });
    fireEvent.click(button);

    expect(await screen.findByText(/Passkey sign-in failed/i)).toBeDefined();
  });
});

let arrivals = 0;

/** Like the real AuthContext: a successful login/signup sets `user`. */
function AuthState({
  auth,
  children,
}: {
  auth: Record<string, unknown>;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<{ id: string } | null>(null);
  const signIn = () => {
    setUser({ id: "u1" });
    return Promise.resolve();
  };
  const value = {
    user,
    providers: { local: true, oidc: null, passkey: true },
    loading: false,
    sessionStatus: user ? "authenticated" : "unauthenticated",
    login: signIn,
    signup: signIn,
    logout: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    ...auth,
  };
  return <MockAuthContext value={value}>{children}</MockAuthContext>;
}

/** Each navigation (new location key) counts as one arrival. */
function LocationProbe() {
  const location = useLocation();
  useEffect(() => {
    arrivals++;
  }, [location.key]);
  return <div data-testid="landed">{location.pathname + location.search}</div>;
}

function renderAt(
  entry: { pathname: string; search?: string; state?: unknown },
  auth: Record<string, unknown> = {},
) {
  arrivals = 0;
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthState auth={auth}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/invite" element={<LocationProbe />} />
          <Route path="/signup" element={<SignupProbe />} />
          <Route path="/" element={<LocationProbe />} />
        </Routes>
      </AuthState>
    </MemoryRouter>,
  );
}

function SignupProbe() {
  const state = useLocation().state as { from?: string } | null;
  return <div data-testid="signup-from">{state?.from}</div>;
}

describe("LoginPage layout", () => {
  it("shows the username form by default, with passkey as a secondary option", () => {
    renderAt({ pathname: "/login" });
    expect(screen.getByLabelText(/username/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeDefined();
    expect(
      screen.getByRole("button", { name: /sign in with passkey/i }),
    ).toBeDefined();
    expect(screen.queryByText(/sign in with username instead/i)).toBeNull();
  });

  it("shows a fixed message for ?error= instead of echoing the URL text", () => {
    renderAt({ pathname: "/login", search: "?error=<b>pwned</b>" });
    expect(screen.queryByText(/pwned/)).toBeNull();
    expect(screen.getByText(/sign-in failed/i)).toBeDefined();
  });
});

describe("LoginPage return-to", () => {
  it("goes back to the saved path after a password sign-in", async () => {
    renderAt(
      { pathname: "/login", state: { from: "/invite?code=abc123" } },
      { providers: { local: true, oidc: null, passkey: false } },
    );
    fireEvent.change(screen.getByLabelText(/username/i), {
      target: { value: "alice" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect((await screen.findByTestId("landed")).textContent).toBe(
      "/invite?code=abc123",
    );
    // Arrive once: a second navigation would redeem the invite code twice.
    await new Promise((r) => setTimeout(r, 50));
    expect(arrivals).toBe(1);
  });

  it("goes to / without a saved path", async () => {
    renderAt(
      { pathname: "/login" },
      { providers: { local: true, oidc: null, passkey: false } },
    );
    fireEvent.change(screen.getByLabelText(/username/i), {
      target: { value: "alice" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect((await screen.findByTestId("landed")).textContent).toBe("/");
  });

  it("sends the saved path as the OIDC callback URL", () => {
    renderAt(
      { pathname: "/login", state: { from: "/invite?code=abc123" } },
      {
        providers: {
          local: true,
          oidc: { name: "Pocket ID", providerId: "pocketid" },
          passkey: true,
        },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: /sign in with pocket id/i }),
    );
    expect(mockSocialSignIn).toHaveBeenCalledWith({
      provider: "pocketid",
      callbackURL: "/invite?code=abc123",
    });
  });

  it("carries the saved path to the sign-up link", async () => {
    renderAt({ pathname: "/login", state: { from: "/invite?code=abc123" } });
    fireEvent.click(screen.getByRole("link", { name: /sign up/i }));
    expect((await screen.findByTestId("signup-from")).textContent).toBe(
      "/invite?code=abc123",
    );
  });
});
