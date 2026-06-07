import { describe, it, expect, mock, afterEach, beforeEach } from "bun:test";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { apiMock, resetApiMock } from "../test-utils/apiMock";
import "../i18n";

// Mock browser Notification API
Object.defineProperty(globalThis, "Notification", {
  value: {
    permission: "granted",
    requestPermission: () =>
      Promise.resolve("granted" as NotificationPermission),
  },
  writable: true,
  configurable: true,
});

// Track calls to push helpers
const mockUnsubscribeFromPush = mock(() => Promise.resolve());
const mockGetExistingSubscription = mock(() =>
  Promise.resolve(null as PushSubscription | null),
);
let mockIsPushSupported = true;

mock.module("../lib/push", () => ({
  isPushSupported: () => mockIsPushSupported,
  subscribeToPush: mock(() =>
    Promise.resolve({
      endpoint: "https://fcm.example.com/new",
      p256dh: "key",
      auth: "auth",
    }),
  ),
  unsubscribeFromPush: mockUnsubscribeFromPush,
  getExistingSubscription: mockGetExistingSubscription,
}));

// Mock AuthContext
mock.module("../context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      username: "testuser",
      display_name: "Test User",
      auth_provider: "local",
      is_admin: false,
    },
    loading: false,
    sessionStatus: "authenticated",
  }),
}));

// Import SettingsPage (which now contains the push notification sections)
const { default: SettingsPage } = await import("./SettingsPage");

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter initialEntries={["/settings?tab=notifications"]}>
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  resetApiMock();
  mockUnsubscribeFromPush.mockReset();
  mockGetExistingSubscription.mockReset();
  mockIsPushSupported = true;
});

beforeEach(() => {
  // Default: no notifiers, no subscription
  apiMock.getNotifiers.mockImplementation(() =>
    Promise.resolve({ notifiers: [] }),
  );
  apiMock.deleteNotifier.mockImplementation(() => Promise.resolve());
  apiMock.testNotifier.mockImplementation(() =>
    Promise.resolve({ success: true, message: "Test notification sent" }),
  );
  // Overrides the shared apiMock defaults that these tests depend on.
  apiMock.getNotifierProviders.mockImplementation(() =>
    Promise.resolve({ providers: ["discord"] }),
  );
  apiMock.getVapidPublicKey.mockImplementation(() =>
    Promise.resolve({ publicKey: "test-key" }),
  );
  apiMock.createNotifier.mockImplementation(() =>
    Promise.resolve({ notifier: { id: "n-new" } }),
  );
  mockUnsubscribeFromPush.mockImplementation(() => Promise.resolve());
  mockGetExistingSubscription.mockImplementation(() => Promise.resolve(null));
});

const FAKE_SUBSCRIPTION = {
  endpoint: "https://fcm.example.com/send/abc",
} as PushSubscription;

function makeWebpushNotifier(overrides: Record<string, any> = {}) {
  return {
    id: "n1",
    user_id: "u1",
    provider: "webpush",
    name: "Webpush",
    config: {
      endpoint: "https://fcm.example.com/send/abc",
      p256dh: "key",
      auth: "auth",
    },
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
    apiMock.getNotifiers.mockImplementation(() =>
      Promise.resolve({ notifiers: [makeWebpushNotifier({ enabled: false })] }),
    );
    mockGetExistingSubscription.mockImplementation(() =>
      Promise.resolve(FAKE_SUBSCRIPTION),
    );

    render(<SettingsPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText(/subscription expired/i)).toBeDefined();
    });

    // Should have cleaned up
    expect(mockUnsubscribeFromPush).toHaveBeenCalled();
    expect(apiMock.deleteNotifier).toHaveBeenCalledWith("n1");

    // Should show Enable button (not enabled state)
    expect(screen.getByText("Enable")).toBeDefined();
  });

  it("auto-cleans up stale DB notifier when browser has no subscription", async () => {
    // Notifier exists in DB but no browser subscription
    apiMock.getNotifiers.mockImplementation(() =>
      Promise.resolve({ notifiers: [makeWebpushNotifier({ enabled: true })] }),
    );
    mockGetExistingSubscription.mockImplementation(() => Promise.resolve(null));

    render(<SettingsPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(apiMock.deleteNotifier).toHaveBeenCalledWith("n1");
    });

    // Should show Enable button
    expect(screen.getByText("Enable")).toBeDefined();
  });

  it("auto-recovers when test reveals expired subscription", async () => {
    // Push is enabled and active
    apiMock.getNotifiers.mockImplementation(() =>
      Promise.resolve({ notifiers: [makeWebpushNotifier()] }),
    );
    mockGetExistingSubscription.mockImplementation(() =>
      Promise.resolve(FAKE_SUBSCRIPTION),
    );

    // Test will return expired
    apiMock.testNotifier.mockImplementation(() =>
      Promise.resolve({
        success: false,
        message: "Push subscription expired: https://fcm.example.com/send/abc",
      }),
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
    expect(apiMock.deleteNotifier).toHaveBeenCalledWith("n1");

    // Should now show Enable button
    expect(screen.getByText("Enable")).toBeDefined();
  });

  it("shows normal error for non-expired test failures", async () => {
    apiMock.getNotifiers.mockImplementation(() =>
      Promise.resolve({ notifiers: [makeWebpushNotifier()] }),
    );
    mockGetExistingSubscription.mockImplementation(() =>
      Promise.resolve(FAKE_SUBSCRIPTION),
    );
    apiMock.testNotifier.mockImplementation(() =>
      Promise.resolve({
        success: false,
        message: "Web push failed (500): Internal error",
      }),
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
    expect(apiMock.deleteNotifier).not.toHaveBeenCalled();
  });

  it("cleans up when fresh subscription fails verification after enable", async () => {
    // Start with no notifiers (user sees Enable button)
    apiMock.getNotifiers.mockImplementation(() =>
      Promise.resolve({ notifiers: [] }),
    );
    mockGetExistingSubscription.mockImplementation(() => Promise.resolve(null));

    // Test notification will report expired subscription
    apiMock.testNotifier.mockImplementation(() =>
      Promise.resolve({
        success: false,
        message: "Push subscription expired: https://fcm.example.com/send/new",
      }),
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
    expect(apiMock.deleteNotifier).toHaveBeenCalledWith("n-new");
    expect(mockUnsubscribeFromPush).toHaveBeenCalled();
  });

  it("renders normally when push is enabled and healthy", async () => {
    apiMock.getNotifiers.mockImplementation(() =>
      Promise.resolve({ notifiers: [makeWebpushNotifier()] }),
    );
    mockGetExistingSubscription.mockImplementation(() =>
      Promise.resolve(FAKE_SUBSCRIPTION),
    );

    render(<SettingsPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Push notifications are enabled")).toBeDefined();
    });

    expect(screen.getByText("Test")).toBeDefined();
    expect(screen.getByText("Disable")).toBeDefined();
  });
});
