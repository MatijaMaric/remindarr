import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";

// Initialize i18n before anything else
import "../i18n";

// Track getSession behavior per test
let mockGetSession: () => Promise<any>;

mock.module("../lib/auth-client", () => ({
  authClient: {
    getSession: () => mockGetSession(),
    signIn: { social: mock(() => {}) },
    signUp: { email: mock(() => Promise.resolve({})) },
    signOut: mock(() => Promise.resolve()),
  },
}));

// Import after mocks
const { AuthProvider } = await import("./AuthContext");
const { default: LoginPage } = await import("../pages/LoginPage");

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <AuthProvider>{children}</AuthProvider>
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
      render(<LoginPage />, { wrapper: Wrapper });

      // The OIDC button should appear even though session check failed
      await waitFor(() => {
        expect(screen.getByText(/PocketID/)).toBeDefined();
      });
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
      render(<LoginPage />, { wrapper: Wrapper });

      // With a valid session and no OIDC, local login form should render
      await waitFor(() => {
        expect(screen.getByLabelText(/username/i)).toBeDefined();
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
