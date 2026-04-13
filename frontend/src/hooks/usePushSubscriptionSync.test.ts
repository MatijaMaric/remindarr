import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { renderHook, waitFor, cleanup } from "@testing-library/react";

const mockSubscription = { endpoint: "https://push.example.com/sub/new", p256dh: "key", auth: "auth" };
const mockNotifier = { id: "n1", provider: "webpush", enabled: true, config: {} };

// Use mock.module (hoisted before imports) to guarantee this file controls
// the push and api modules even when other test files have called
// mock.module on the same specifiers earlier in the bun process.
const mockIsPushSupported = mock(() => true as boolean);
const mockSubscribeToPush = mock(() => Promise.resolve(mockSubscription));
const mockGetExistingSubscription = mock(() =>
  Promise.resolve({ endpoint: "https://push.example.com/sub/old" } as PushSubscription | null),
);

mock.module("../lib/push", () => ({
  isPushSupported: mockIsPushSupported,
  subscribeToPush: mockSubscribeToPush,
  getExistingSubscription: mockGetExistingSubscription,
  unsubscribeFromPush: mock(() => Promise.resolve()),
}));

const mockGetNotifiers = mock(() =>
  Promise.resolve({ notifiers: [mockNotifier] } as any),
);
const mockGetVapidPublicKey = mock(() =>
  Promise.resolve({ publicKey: "vapid-key" }),
);
const mockUpdateNotifier = mock(() =>
  Promise.resolve({ notifier: mockNotifier } as any),
);

mock.module("../api", () => ({
  getNotifiers: mockGetNotifiers,
  getVapidPublicKey: mockGetVapidPublicKey,
  updateNotifier: mockUpdateNotifier,
}));

import { usePushSubscriptionSync } from "./usePushSubscriptionSync";

let controllerChangeListeners: Array<(e: Event) => void> = [];

function mockNotificationPermission(value: NotificationPermission) {
  Object.defineProperty(globalThis, "Notification", {
    value: { permission: value },
    writable: true,
    configurable: true,
  });
}

function mockServiceWorker() {
  const sw = {
    addEventListener: mock((event: string, handler: (e: Event) => void) => {
      if (event === "controllerchange") controllerChangeListeners.push(handler);
    }),
    removeEventListener: mock((event: string, handler: (e: Event) => void) => {
      if (event === "controllerchange") {
        controllerChangeListeners = controllerChangeListeners.filter((l) => l !== handler);
      }
    }),
  };
  Object.defineProperty(navigator, "serviceWorker", {
    value: sw,
    writable: true,
    configurable: true,
  });
  return sw;
}

beforeEach(() => {
  controllerChangeListeners = [];
  mockNotificationPermission("granted");
  mockServiceWorker();

  // Reset all mocks to default behavior
  mockIsPushSupported.mockReturnValue(true);
  mockSubscribeToPush.mockImplementation(() => Promise.resolve(mockSubscription));
  mockGetExistingSubscription.mockImplementation(() =>
    Promise.resolve({ endpoint: "https://push.example.com/sub/old" } as any),
  );
  mockGetNotifiers.mockImplementation(() =>
    Promise.resolve({ notifiers: [mockNotifier] } as any),
  );
  mockGetVapidPublicKey.mockImplementation(() =>
    Promise.resolve({ publicKey: "vapid-key" }),
  );
  mockUpdateNotifier.mockImplementation(() =>
    Promise.resolve({ notifier: mockNotifier } as any),
  );
});

afterEach(() => {
  cleanup();
  mockIsPushSupported.mockReset();
  mockSubscribeToPush.mockReset();
  mockGetExistingSubscription.mockReset();
  mockGetNotifiers.mockReset();
  mockGetVapidPublicKey.mockReset();
  mockUpdateNotifier.mockReset();
});

describe("usePushSubscriptionSync", () => {
  it("does nothing on mount when notifier is enabled and subscription exists", async () => {
    renderHook(() => usePushSubscriptionSync());

    await waitFor(() => {
      expect(mockGetNotifiers).toHaveBeenCalled();
    });

    expect(mockSubscribeToPush).not.toHaveBeenCalled();
    expect(mockUpdateNotifier).not.toHaveBeenCalled();
  });

  it("re-subscribes on mount when notifier is disabled", async () => {
    mockGetNotifiers.mockResolvedValue({ notifiers: [{ ...mockNotifier, enabled: false }] });

    renderHook(() => usePushSubscriptionSync());

    await waitFor(() => {
      expect(mockUpdateNotifier).toHaveBeenCalledWith("n1", { config: mockSubscription, enabled: true });
    });
  });

  it("re-subscribes on mount when browser has no active subscription", async () => {
    mockGetExistingSubscription.mockResolvedValue(null);

    renderHook(() => usePushSubscriptionSync());

    await waitFor(() => {
      expect(mockUpdateNotifier).toHaveBeenCalledWith("n1", { config: mockSubscription, enabled: true });
    });
  });

  it("does nothing on mount when push is not supported", async () => {
    mockIsPushSupported.mockReturnValue(false);

    renderHook(() => usePushSubscriptionSync());

    // Give effects time to run
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockGetNotifiers).not.toHaveBeenCalled();
  });

  it("does nothing on mount when permission is not granted", async () => {
    mockNotificationPermission("default");

    renderHook(() => usePushSubscriptionSync());

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockSubscribeToPush).not.toHaveBeenCalled();
  });

  it("does nothing on mount when no webpush notifier exists", async () => {
    mockGetNotifiers.mockResolvedValue({ notifiers: [] });

    renderHook(() => usePushSubscriptionSync());

    await waitFor(() => {
      expect(mockGetNotifiers).toHaveBeenCalled();
    });

    expect(mockSubscribeToPush).not.toHaveBeenCalled();
  });

  it("re-subscribes when controllerchange fires", async () => {
    mockGetExistingSubscription.mockResolvedValue({ endpoint: "old" } as any);

    renderHook(() => usePushSubscriptionSync());

    // Wait for mount check to complete (enabled notifier + existing sub = no-op)
    await waitFor(() => expect(mockGetNotifiers).toHaveBeenCalledTimes(1));

    // Simulate the notifier becoming disabled after a SW update
    mockGetNotifiers.mockResolvedValue({ notifiers: [{ ...mockNotifier, enabled: false }] });

    // Fire controllerchange
    controllerChangeListeners.forEach((l) => l(new Event("controllerchange")));

    await waitFor(() => {
      expect(mockUpdateNotifier).toHaveBeenCalledWith("n1", { config: mockSubscription, enabled: true });
    });
  });

  it("removes controllerchange listener on unmount", async () => {
    const sw = navigator.serviceWorker as any;
    const { unmount } = renderHook(() => usePushSubscriptionSync());

    unmount();

    expect(sw.removeEventListener).toHaveBeenCalledWith("controllerchange", expect.any(Function));
  });

  it("swallows errors silently", async () => {
    mockGetNotifiers.mockRejectedValue(new Error("Network error"));

    // Should not throw
    expect(() => renderHook(() => usePushSubscriptionSync())).not.toThrow();

    await new Promise((resolve) => setTimeout(resolve, 20));
  });
});
