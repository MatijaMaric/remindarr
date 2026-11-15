import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { createContext, useContext, useEffect, useState } from "react";

import "../i18n";

// Mock useAuth directly so this test is immune to AuthContext mock.module
// leakage from sibling test files.
const MockAuthContext = createContext<any>(null);
mock.module("../context/AuthContext", () => ({
  useAuth: () =>
    useContext(MockAuthContext) ?? {
      user: null,
      providers: { local: true, oidc: null, passkey: true },
      loading: false,
      sessionStatus: "unauthenticated",
      login: () => Promise.resolve(),
      signup: () => Promise.resolve(),
      logout: () => Promise.resolve(),
      refresh: () => Promise.resolve(),
    },
  AuthContext: MockAuthContext,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const { default: SignupPage } = await import("./SignupPage");

afterEach(cleanup);

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

/** Shows where the sign-in link went and the saved path it carried. */
function LoginProbe() {
  const state = useLocation().state as { from?: string } | null;
  return <div data-testid="login-from">{state?.from}</div>;
}

function renderAt(entry: { pathname: string; state?: unknown }) {
  arrivals = 0;
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthState auth={{}}>
        <Routes>
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<LoginProbe />} />
          <Route path="/invite" element={<LocationProbe />} />
          <Route path="/" element={<LocationProbe />} />
        </Routes>
      </AuthState>
    </MemoryRouter>,
  );
}

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText(/username/i), {
    target: { value: "alice" },
  });
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: "alice@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/^password$/i), {
    target: { value: "secret123" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));
}

describe("SignupPage", () => {
  it("states the username and password rules in the browser", () => {
    renderAt({ pathname: "/signup" });
    const username = screen.getByLabelText(/username/i) as HTMLInputElement;
    const password = screen.getByLabelText(/^password$/i) as HTMLInputElement;
    expect(username.getAttribute("pattern")).toBe("[a-zA-Z0-9_.\\-]+");
    expect(
      screen.getByText("Letters, numbers, dots, dashes and underscores"),
    ).toBeDefined();
    expect(password.getAttribute("minlength")).toBe("8");
  });

  it("goes back to the saved path after signing up", async () => {
    renderAt({ pathname: "/signup", state: { from: "/invite?code=abc123" } });
    fillAndSubmit();
    expect((await screen.findByTestId("landed")).textContent).toBe(
      "/invite?code=abc123",
    );
    // Arrive once: a second navigation would redeem the invite code twice.
    await new Promise((r) => setTimeout(r, 50));
    expect(arrivals).toBe(1);
  });

  it("goes to / without a saved path", async () => {
    renderAt({ pathname: "/signup" });
    fillAndSubmit();
    expect((await screen.findByTestId("landed")).textContent).toBe("/");
  });

  it("carries the saved path to the sign-in link", async () => {
    renderAt({ pathname: "/signup", state: { from: "/invite?code=abc123" } });
    fireEvent.click(screen.getByRole("link", { name: /sign in/i }));
    expect((await screen.findByTestId("login-from")).textContent).toBe(
      "/invite?code=abc123",
    );
  });
});
