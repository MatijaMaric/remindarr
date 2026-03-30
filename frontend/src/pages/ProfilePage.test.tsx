import { describe, it, expect, mock, afterEach, beforeEach } from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import "../i18n";

// Mock browser Notification API
Object.defineProperty(globalThis, "Notification", {
  value: { permission: "granted", requestPermission: () => Promise.resolve("granted" as NotificationPermission) },
  writable: true,
  configurable: true,
});

// Track calls to push helpers
const mockUnsubscribeFromPush = mock(() => Promise.resolve());
const mockGetExistingSubscription = mock(() => Promise.resolve(null as PushSubscription | null));
let mockIsPushSupported = true;

mock.module("../lib/push", () => ({
  isPushSupported: () => mockIsPushSupported,
  subscribeToPush: mock(() => Promise.resolve({ endpoint: "https://fcm.example.com/new", p256dh: "key", auth: "auth" })),
  unsubscribeFromPush: mockUnsubscribeFromPush,
  getExistingSubscription: mockGetExistingSubscription,
}));

// Mock API
const mockGetNotifiers = mock(() => Promise.resolve({ notifiers: [] as any[] }));
const mockDeleteNotifier = mock(() => Promise.resolve());
const mockTestNotifier = mock(() => Promise.resolve({ success: true, message: "Test notification sent" }));

mock.module("../api", () => ({
  getNotifiers: mockGetNotifiers,
  getNotifierProviders: mock(() => Promise.resolve({ providers: ["discord"] })),
  getVapidPublicKey: mock(() => Promise.resolve({ publicKey: "test-key" })),
  createNotifier: mock(() => Promise.resolve({ notifier: { id: "n-new" } })),
  updateNotifier: mock(() => Promise.resolve({ notifier: {} })),
  deleteNotifier: mockDeleteNotifier,
  testNotifier: mockTestNotifier,
  getJobs: mock(() => Promise.resolve({ crons: [], stats: {}, recentJobs: [] })),
  getAdminSettings: mock(() => Promise.resolve({ oidc_configured: false, oidc: { issuer_url: { value: "", source: "unset" }, client_id: { value: "", source: "unset" }, client_secret: { value: "", source: "unset" }, redirect_uri: { value: "", source: "unset" } } })),
  changePassword: mock(() => Promise.resolve()),
  getTrackedTitles: mock(() => Promise.resolve({ titles: [], count: 0, profile_public: false })),
  updateProfileVisibility: mock(() => Promise.resolve()),
  updateTitleVisibility: mock(() => Promise.resolve()),
  updateAllTitleVisibility: mock(() => Promise.resolve()),
}));

// Mock AuthContext
mock.module("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", username: "testuser", display_name: "Test User", auth_provider: "local", is_admin: false },
    loading: false,
  }),
}));

// Import SettingsPage (which now contains the push notification sections)
const { default: SettingsPage } = await import("./SettingsPage");

function Wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

afterEach(() => {
  cleanup();
  mockGetNotifiers.mockReset();
  mockDeleteNotifier.mockReset();
  mockTestNotifier.mockReset();
  mockUnsubscribeFromPush.mockReset();
  mockGetExistingSubscription.mockReset();
  mockIsPushSupported = true;
});

beforeEach(() => {
  // Default: no notifiers, no subscription
  mockGetNotifiers.mockImplementation(() => Promise.resolve({ notifiers: [] }));
  mockDeleteNotifier.mockImplementation(() => Promise.resolve());
  mockUnsubscribeFromPush.mockImplementation(() => Promise.resolve());
  mockGetExistingSubscription.mockImplementation(() => Promise.resolve(null));
  mockTestNotifier.mockImplementation(() => Promise.resolve({ success: true, message: "Test notification sent" }));
});

const FAKE_SUBSCRIPTION = { endpoint: "https://fcm.example.com/send/abc" } as PushSubscription;

function makeWebpushNotifier(overrides: Record<string, any> = {}) {
  return {
    id: "n1",
    user_id: "u1",
    provider: "webpush",
    name: "Webpush",
    config: { endpoint: "https://fcm.example.com/send/abc", p256dh: "key", auth: "auth" },
    notify_time: "09:00",
    timezone: "UTC",
    enabled: true,
    last_sent_date: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  };
}

describe("PushNotificationsSection", () => {
  it("auto-cleans up disabled webpush notifier on page load", async () => {
    // Notifier exists but is disabled (background job disabled it)
    mockGetNotifiers.mockImplementation(() =>
      Promise.resolve({ notifiers: [makeWebpushNotifier({ enabled: false })] })
    );
    mockGetExistingSubscription.mockImplementation(() => Promise.resolve(FAKE_SUBSCRIPTION));

    render(<SettingsPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText(/subscription expired/i)).toBeDefined();
    });

    // Should have cleaned up
    expect(mockUnsubscribeFromPush).toHaveBeenCalled();
    expect(mockDeleteNotifier).toHaveBeenCalledWith("n1");

    // Should show Enable button (not enabled state)
    expect(screen.getByText("Enable")).toBeDefined();
  });

  it("auto-cleans up stale DB notifier when browser has no subscription", async () => {
    // Notifier exists in DB but no browser subscription
    mockGetNotifiers.mockImplementation(() =>
      Promise.resolve({ notifiers: [makeWebpushNotifier({ enabled: true })] })
    );
    mockGetExistingSubscription.mockImplementation(() => Promise.resolve(null));

    render(<SettingsPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(mockDeleteNotifier).toHaveBeenCalledWith("n1");
    });

    // Should show Enable button
    expect(screen.getByText("Enable")).toBeDefined();
  });

  it("auto-recovers when test reveals expired subscription", async () => {
    // Push is enabled and active
    mockGetNotifiers.mockImplementation(() =>
      Promise.resolve({ notifiers: [makeWebpushNotifier()] })
    );
    mockGetExistingSubscription.mockImplementation(() => Promise.resolve(FAKE_SUBSCRIPTION));

    // Test will return expired
    mockTestNotifier.mockImplementation(() =>
      Promise.resolve({ success: false, message: "Push subscription expired: https://fcm.example.com/send/abc" })
    );

    render(<SettingsPage />, { wrapper: Wrapper });

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText("Test")).toBeDefined();
    });

    // Click test button
    fireEvent.click(screen.getByText("Test"));

    await waitFor(() => {
      expect(screen.getByText(/subscription expired/i)).toBeDefined();
    });

    // Should have cleaned up
    expect(mockUnsubscribeFromPush).toHaveBeenCalled();
    expect(mockDeleteNotifier).toHaveBeenCalledWith("n1");

    // Should now show Enable button
    expect(screen.getByText("Enable")).toBeDefined();
  });

  it("shows normal error for non-expired test failures", async () => {
    mockGetNotifiers.mockImplementation(() =>
      Promise.resolve({ notifiers: [makeWebpushNotifier()] })
    );
    mockGetExistingSubscription.mockImplementation(() => Promise.resolve(FAKE_SUBSCRIPTION));
    mockTestNotifier.mockImplementation(() =>
      Promise.resolve({ success: false, message: "Web push failed (500): Internal error" })
    );

    render(<SettingsPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Test")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Test"));

    await waitFor(() => {
      expect(screen.getByText(/Web push failed/)).toBeDefined();
    });

    // Should NOT have cleaned up
    expect(mockDeleteNotifier).not.toHaveBeenCalled();
  });

  it("cleans up when fresh subscription fails verification after enable", async () => {
    // Start with no notifiers (user sees Enable button)
    mockGetNotifiers.mockImplementation(() => Promise.resolve({ notifiers: [] }));
    mockGetExistingSubscription.mockImplementation(() => Promise.resolve(null));

    // Test notification will report expired subscription
    mockTestNotifier.mockImplementation(() =>
      Promise.resolve({ success: false, message: "Push subscription expired: https://fcm.example.com/send/new" })
    );

    render(<SettingsPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Enable")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Enable"));

    await waitFor(() => {
      expect(screen.getByText(/Could not establish/)).toBeDefined();
    });

    // Should have cleaned up the just-created notifier
    expect(mockDeleteNotifier).toHaveBeenCalledWith("n-new");
    expect(mockUnsubscribeFromPush).toHaveBeenCalled();
  });

  it("renders normally when push is enabled and healthy", async () => {
    mockGetNotifiers.mockImplementation(() =>
      Promise.resolve({ notifiers: [makeWebpushNotifier()] })
    );
    mockGetExistingSubscription.mockImplementation(() => Promise.resolve(FAKE_SUBSCRIPTION));

    render(<SettingsPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Push notifications are enabled")).toBeDefined();
    });

    expect(screen.getByText("Test")).toBeDefined();
    expect(screen.getByText("Disable")).toBeDefined();
  });
});
