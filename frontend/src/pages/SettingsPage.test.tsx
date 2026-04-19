import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";

// Initialize i18n before anything else
import "../i18n";

// Mock auth context to provide a user directly
mock.module("../context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      username: "testuser",
      display_name: "Test User",
      auth_provider: "local",
      is_admin: false,
    },
    providers: { local: true, oidc: null },
    loading: false,
    login: mock(() => Promise.resolve()),
    signup: mock(() => Promise.resolve()),
    logout: mock(() => Promise.resolve()),
    refresh: mock(() => Promise.resolve()),
  }),
}));

// Mock auth-client (imported by SettingsPage directly)
mock.module("../lib/auth-client", () => ({
  authClient: {
    changePassword: mock(() => Promise.resolve({})),
    passkey: {
      addPasskey: mock(() => Promise.resolve({})),
      listPasskeys: mock(() => Promise.resolve([])),
      deletePasskey: mock(() => Promise.resolve()),
    },
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
    profile_visibility: "public",
  })
);

mock.module("../api", () => ({
  getTrackedTitles: mockGetTrackedTitles,
  updateProfileVisibility: mock(() => Promise.resolve()),
  updateTitleVisibility: mock(() => Promise.resolve()),
  updateAllTitleVisibility: mock(() => Promise.resolve()),
  exportWatchlist: mock(() => Promise.resolve([])),
  importWatchlist: mock(() => Promise.resolve({ imported: 0 })),
  getNotifiers: mock(() => Promise.resolve({ notifiers: [] })),
  getNotifierProviders: mock(() => Promise.resolve({ providers: [] })),
  createNotifier: mock(() => Promise.resolve({ notifier: {} })),
  updateNotifier: mock(() => Promise.resolve()),
  deleteNotifier: mock(() => Promise.resolve()),
  testNotifier: mock(() => Promise.resolve({ success: true })),
  getVapidPublicKey: mock(() => Promise.resolve({ publicKey: "" })),
  getJobs: mock(() => Promise.resolve({ stats: {}, crons: [], recentJobs: [] })),
  triggerJob: mock(() => Promise.resolve({ success: true, jobId: 1 })),
  getAdminSettings: mock(() =>
    Promise.resolve({
      oidc: {
        issuer_url: { value: "", source: "unset" },
        client_id: { value: "", source: "unset" },
        client_secret: { value: "", source: "unset" },
        redirect_uri: { value: "", source: "unset" },
        admin_claim: { value: "", source: "unset" },
        admin_value: { value: "", source: "unset" },
      },
      oidc_configured: false,
    })
  ),
  updateAdminSettings: mock(() => Promise.resolve({})),
  getHomepageLayout: mock(() => Promise.resolve({ homepage_layout: [{ id: "unwatched", enabled: true }, { id: "recommendations", enabled: true }, { id: "today", enabled: true }, { id: "upcoming", enabled: true }] })),
  updateHomepageLayout: mock(() => Promise.resolve({ homepage_layout: [{ id: "unwatched", enabled: true }, { id: "recommendations", enabled: true }, { id: "today", enabled: true }, { id: "upcoming", enabled: true }] })),
  getIntegrations: mock(() => Promise.resolve({ integrations: [] })),
  createPlexPin: mock(() => Promise.resolve({ pinId: 0, authUrl: "" })),
  checkPlexPin: mock(() => Promise.resolve({ status: "pending" })),
  refreshPlexServers: mock(() => Promise.resolve({ servers: [] })),
  createIntegration: mock(() => Promise.resolve({ integration: {} })),
  updateIntegration: mock(() => Promise.resolve()),
  deleteIntegration: mock(() => Promise.resolve()),
  triggerPlexSync: mock(() => Promise.resolve({ success: true })),
  getFeedToken: mock(() => Promise.resolve({ token: "test-token" })),
  regenerateFeedToken: mock(() => Promise.resolve({ token: "new-token" })),
}));

// Import after mocks
const { default: SettingsPage } = await import("./SettingsPage");

function Wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

function WrapperWithPath(path: string) {
  return function ({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>;
  };
}

afterEach(() => {
  cleanup();
});

describe("ProfileVisibilitySection", () => {
  it("renders three visibility options and bulk buttons", async () => {
    render(<SettingsPage />, { wrapper: Wrapper });

    // Wait for the profile visibility section to load
    await waitFor(() => {
      expect(screen.getByText("Profile Visibility")).toBeDefined();
    });

    // Three visibility options should be present
    expect(screen.getByText("Public")).toBeDefined();
    expect(screen.getByText("Everyone can see your watchlist")).toBeDefined();
    expect(screen.getByText("Friends Only")).toBeDefined();
    expect(screen.getByText("Only mutual followers can see your watchlist")).toBeDefined();
    expect(screen.getByText("Private")).toBeDefined();
    expect(screen.getByText("Your watchlist is hidden")).toBeDefined();

    // Bulk buttons should be present
    expect(screen.getByText("Show All")).toBeDefined();
    expect(screen.getByText("Hide All")).toBeDefined();

    // Per-title entries should NOT be rendered (no individual title names in the list)
    expect(screen.queryByText("Test Movie")).toBeNull();
    expect(screen.queryByText("Test Show")).toBeNull();
  });

  it("shows empty state when no tracked titles", async () => {
    mockGetTrackedTitles.mockImplementation(() =>
      Promise.resolve({
        titles: [],
        count: 0,
        profile_public: false,
        profile_visibility: "private",
      })
    );

    render(<SettingsPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Profile Visibility")).toBeDefined();
    });

    // Empty state message
    expect(screen.getByText("No tracked titles to manage.")).toBeDefined();

    // Bulk buttons should NOT be present when no titles
    expect(screen.queryByText("Show All")).toBeNull();
    expect(screen.queryByText("Hide All")).toBeNull();
  });

  it("selects the correct radio button based on profile_visibility", async () => {
    mockGetTrackedTitles.mockImplementation(() =>
      Promise.resolve({
        titles: [{ id: "m1", title: "Movie", object_type: "movie", poster_url: null, public: true }],
        count: 1,
        profile_public: false,
        profile_visibility: "friends_only",
      })
    );

    render(<SettingsPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Profile Visibility")).toBeDefined();
    });

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    // friends_only should be checked (second option)
    const friendsRadio = radios.find((r) => (r as HTMLInputElement).value === "friends_only") as HTMLInputElement | undefined;
    expect(friendsRadio).toBeDefined();
    expect(friendsRadio!.checked).toBe(true);
  });
});

describe("Settings tabs", () => {
  it("renders tab list with expected tabs for non-admin user", async () => {
    render(<SettingsPage />, { wrapper: Wrapper });

    // Wait for the sidebar nav to be rendered — all tabs appear as <button> elements in the sidebar
    await waitFor(() => {
      const navButtons = screen.getAllByRole("button", { name: "Account" });
      expect(navButtons.length).toBeGreaterThanOrEqual(1);
    });

    // Sidebar nav buttons for each tab should exist
    expect(screen.getAllByRole("button", { name: "Appearance" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("button", { name: "Notifications" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("button", { name: "Integrations" }).length).toBeGreaterThanOrEqual(1);
    // Admin tab should not appear for non-admin users
    expect(screen.queryByRole("button", { name: "Admin" })).toBeNull();
  });

  it("shows account tab content by default", async () => {
    render(<SettingsPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Profile Visibility")).toBeDefined();
    });

    // Appearance-tab content should not be rendered (conditional rendering)
    expect(screen.queryByText("Homepage Layout")).toBeNull();
  });

  it("shows notifications tab content when ?tab=notifications", async () => {
    render(<SettingsPage />, { wrapper: WrapperWithPath("/settings?tab=notifications") });

    // The notifications card title and the sidebar button both say "Notifications" —
    // use the SettingsCard subtitle which is unique to the notifications tab content
    await waitFor(() => {
      expect(screen.getByText("How and when you receive alerts")).toBeDefined();
    });

    // Account-tab content should not be rendered
    expect(screen.queryByText("Profile Visibility")).toBeNull();
  });
});
