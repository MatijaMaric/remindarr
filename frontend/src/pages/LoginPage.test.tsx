import { describe, it, expect, mock, afterEach, beforeEach } from "bun:test";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import "../i18n";

type PasskeyError = { code?: string; message?: string; status?: number };
type PasskeyResult = { data: unknown; error: PasskeyError | null };
type SessionResult = { data: { user: { id: string; name?: string; username?: string; role?: string | null } } | null };

let mockPasskeySignIn: (opts?: { autoFill?: boolean }) => Promise<PasskeyResult>;
let mockGetSession: () => Promise<SessionResult>;

mock.module("../lib/auth-client", () => ({
  authClient: {
    getSession: () => mockGetSession(),
    signIn: {
      passkey: (opts?: { autoFill?: boolean }) => mockPasskeySignIn(opts),
      username: mock(() => Promise.resolve({ data: null, error: null })),
      social: mock(() => {}),
    },
    signUp: { email: mock(() => Promise.resolve({})) },
    signOut: mock(() => Promise.resolve()),
  },
}));

// Mock useAuth directly so this test is immune to AuthContext mock.module
// leakage from sibling test files.
mock.module("../context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    providers: { local: true, oidc: null, passkey: true },
    loading: false,
    login: () => Promise.resolve(),
    signup: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
  }),
  AuthContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
}));

const { default: LoginPage } = await import("./LoginPage");

const originalPublicKeyCredential = (globalThis as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential;

beforeEach(() => {
  // Make isWebAuthnSupported() true without triggering conditional mediation.
  (globalThis as unknown as { PublicKeyCredential: unknown }).PublicKeyCredential = {
    isConditionalMediationAvailable: () => Promise.resolve(false),
  };
  mockGetSession = () => Promise.resolve({ data: null });
});

afterEach(() => {
  cleanup();
  if (originalPublicKeyCredential === undefined) {
    delete (globalThis as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential;
  } else {
    (globalThis as unknown as { PublicKeyCredential: unknown }).PublicKeyCredential = originalPublicKeyCredential;
  }
});

describe("LoginPage passkey sign-in", () => {
  it("does not show an error when the passkey prompt is cancelled (AUTH_CANCELLED)", async () => {
    mockPasskeySignIn = () =>
      Promise.resolve({
        data: null,
        error: { code: "AUTH_CANCELLED", message: "AUTH_CANCELLED", status: 400 },
      });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const button = await screen.findByRole("button", { name: /sign in with passkey/i });
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
        error: { code: "INVALID_CHALLENGE", message: "Challenge expired", status: 400 },
      });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const button = await screen.findByRole("button", { name: /sign in with passkey/i });
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
      </MemoryRouter>
    );

    const button = await screen.findByRole("button", { name: /sign in with passkey/i });
    fireEvent.click(button);

    expect(await screen.findByText(/Passkey sign-in failed/i)).toBeDefined();
  });
});
