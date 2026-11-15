import { describe, it, expect, mock, afterEach, beforeEach } from "bun:test";
import {
  render,
  screen,
  waitFor,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { createContext, useContext } from "react";

import "../i18n";

type AuthUser = {
  id: string;
  username: string;
  display_name: string | null;
  auth_provider: string;
  is_admin: boolean;
};
type SessionStatus = "authenticated" | "unauthenticated" | "unknown";

let mockUser: AuthUser | null;
let mockLoading: boolean;
let mockSessionStatus: SessionStatus;
let mockRefresh: () => Promise<void>;

// Use a real React context so the leaked mock doesn't break <AuthContext value={...}> in other test files.
const MockAuthContext = createContext<any>(null);

mock.module("../context/AuthContext", () => ({
  useAuth: () =>
    useContext(MockAuthContext) ?? {
      user: mockUser,
      loading: mockLoading,
      sessionStatus: mockSessionStatus,
      refresh: () => mockRefresh(),
      providers: null,
      subscriptions: null,
      refreshSubscriptions: () => Promise.resolve(),
      login: () => Promise.resolve(),
      signup: () => Promise.resolve(),
      logout: () => Promise.resolve(),
    },
  AuthContext: MockAuthContext,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const { default: RequireAuth } = await import("./RequireAuth");

function LoginProbe() {
  const state = useLocation().state as { from?: string } | null;
  return <div data-testid="login-page">{state?.from}</div>;
}

function renderProtected() {
  const authValue = {
    user: mockUser,
    loading: mockLoading,
    sessionStatus: mockSessionStatus,
    refresh: () => mockRefresh(),
    providers: null,
    subscriptions: null,
    refreshSubscriptions: () => Promise.resolve(),
    login: () => Promise.resolve(),
    signup: () => Promise.resolve(),
    logout: () => Promise.resolve(),
  };

  return render(
    <MemoryRouter initialEntries={["/protected?code=abc123"]}>
      <MockAuthContext value={authValue}>
        <Routes>
          <Route
            path="/protected"
            element={
              <RequireAuth>
                <div data-testid="protected-content">Protected</div>
              </RequireAuth>
            }
          />
          <Route path="/login" element={<LoginProbe />} />
        </Routes>
      </MockAuthContext>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

beforeEach(() => {
  mockUser = null;
  mockLoading = false;
  mockSessionStatus = "unauthenticated";
  mockRefresh = () => Promise.resolve();
});

describe("RequireAuth", () => {
  it("shows loading indicator while auth is resolving, no redirect", () => {
    mockLoading = true;
    mockSessionStatus = "unknown";
    renderProtected();
    expect(screen.queryByTestId("login-page")).toBeNull();
    expect(screen.queryByTestId("protected-content")).toBeNull();
    expect(screen.getByText(/Loading/i)).toBeDefined();
  });

  it("navigates to /login when session is definitively unauthenticated", async () => {
    mockLoading = false;
    mockSessionStatus = "unauthenticated";
    mockUser = null;
    renderProtected();
    await waitFor(() => {
      expect(screen.getByTestId("login-page")).toBeDefined();
    });
    expect(screen.queryByTestId("protected-content")).toBeNull();
  });

  it("passes the original path and query to /login so sign-in can return there", async () => {
    renderProtected();
    await waitFor(() => {
      expect(screen.getByTestId("login-page").textContent).toBe(
        "/protected?code=abc123",
      );
    });
  });

  it("shows Reconnecting panel without redirecting when session status is unknown", () => {
    mockLoading = false;
    mockSessionStatus = "unknown";
    mockUser = null;
    renderProtected();
    expect(screen.queryByTestId("login-page")).toBeNull();
    expect(screen.queryByTestId("protected-content")).toBeNull();
    expect(screen.getByRole("button", { name: /try again/i })).toBeDefined();
  });

  it("renders children when session is authenticated", () => {
    mockLoading = false;
    mockSessionStatus = "authenticated";
    mockUser = {
      id: "u1",
      username: "testuser",
      display_name: null,
      auth_provider: "local",
      is_admin: false,
    };
    renderProtected();
    expect(screen.getByTestId("protected-content")).toBeDefined();
    expect(screen.queryByTestId("login-page")).toBeNull();
  });

  it("calls refresh when the Try again button is clicked", async () => {
    let refreshCalled = false;
    mockRefresh = () => {
      refreshCalled = true;
      return Promise.resolve();
    };
    mockLoading = false;
    mockSessionStatus = "unknown";
    renderProtected();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => {
      expect(refreshCalled).toBe(true);
    });
  });
});
