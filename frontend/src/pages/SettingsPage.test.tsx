import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";

// Initialize i18n before anything else
import "../i18n";

// Mock auth context
let mockGetSession: () => Promise<any>;

mock.module("../lib/auth-client", () => ({
  authClient: {
    getSession: () => mockGetSession(),
    signIn: { social: mock(() => {}), username: mock(() => Promise.resolve({})) },
    signUp: { email: mock(() => Promise.resolve({})) },
    signOut: mock(() => Promise.resolve()),
    changePassword: mock(() => Promise.resolve({})),
  },
}));

// Mock push support — not relevant for these tests
mock.module("../lib/push", () => ({
  isPushSupported: () => false,
  subscribeToPush: mock(() => Promise.resolve()),
  unsubscribeFromPush: mock(() => Promise.resolve()),
  getExistingSubscription: mock(() => Promise.resolve(null)),
}));

// Mock api module with tracked titles response
const mockGetTrackedTitles = mock(() =>
  Promise.resolve({
    titles: [
      {
        id: "movie-1",
        title: "Test Movie",
        object_type: "movie",
        poster_url: "https://example.com/poster.jpg",
        public: true,
      },
      {
        id: "show-2",
        title: "Test Show",
        object_type: "show",
        poster_url: null,
        public: false,
      },
    ],
    count: 2,
    profile_public: true,
  })
);

mock.module("../api", () => ({
  getTrackedTitles: mockGetTrackedTitles,
  updateProfileVisibility: mock(() => Promise.resolve()),
  updateTitleVisibility: mock(() => Promise.resolve()),
  updateAllTitleVisibility: mock(() => Promise.resolve()),
  exportWatchlist: mock(() => Promise.resolve([])),
  importWatchlist: mock(() => Promise.resolve({ imported: 0 })),
  getNotifiers: mock(() => Promise.resolve([])),
  getNotifierProviders: mock(() => Promise.resolve({ providers: [] })),
  createNotifier: mock(() => Promise.resolve({ notifier: {} })),
  updateNotifier: mock(() => Promise.resolve()),
  deleteNotifier: mock(() => Promise.resolve()),
  testNotifier: mock(() => Promise.resolve({ success: true })),
  getVapidPublicKey: mock(() => Promise.resolve({ publicKey: "" })),
  getJobs: mock(() => Promise.resolve({ stats: {}, crons: [], recentJobs: [] })),
  triggerJob: mock(() => Promise.resolve({ success: true, jobId: 1 })),
  getAdminSettings: mock(() => Promise.resolve({})),
  updateAdminSettings: mock(() => Promise.resolve({})),
}));

// Import after mocks
const { AuthProvider } = await import("../context/AuthContext");
const { default: SettingsPage } = await import("./SettingsPage");

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

describe("ProfileVisibilitySection", () => {
  it("renders global toggle and bulk buttons without per-title list", async () => {
    mockGetSession = () =>
      Promise.resolve({
        data: {
          user: {
            id: "u1",
            name: "Test User",
            username: "testuser",
            role: "user",
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
      render(<SettingsPage />, { wrapper: Wrapper });

      // Wait for the profile visibility section to load
      await waitFor(() => {
        expect(screen.getByText("Profile Visibility")).toBeDefined();
      });

      // Global toggle text should be present
      expect(screen.getByText("Show watchlist on public profile")).toBeDefined();

      // Bulk buttons should be present
      expect(screen.getByText("Show All")).toBeDefined();
      expect(screen.getByText("Hide All")).toBeDefined();

      // Per-title entries should NOT be rendered (no individual title names in the list)
      expect(screen.queryByText("Test Movie")).toBeNull();
      expect(screen.queryByText("Test Show")).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("shows empty state when no tracked titles", async () => {
    mockGetSession = () =>
      Promise.resolve({
        data: {
          user: {
            id: "u1",
            name: "Test User",
            username: "testuser",
            role: "user",
          },
        },
      });

    mockGetTrackedTitles.mockImplementation(() =>
      Promise.resolve({
        titles: [],
        count: 0,
        profile_public: false,
      })
    );

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
      render(<SettingsPage />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(screen.getByText("Profile Visibility")).toBeDefined();
      });

      // Empty state message
      expect(screen.getByText("No tracked titles to manage.")).toBeDefined();

      // Bulk buttons should NOT be present when no titles
      expect(screen.queryByText("Show All")).toBeNull();
      expect(screen.queryByText("Hide All")).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
