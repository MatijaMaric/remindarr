import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import * as push from "../lib/push";
import * as api from "../api";
import { usePushSubscriptionSync } from "./usePushSubscriptionSync";

const mockSubscription = { endpoint: "https://push.example.com/sub/new", p256dh: "key", auth: "auth" };
const mockNotifier = { id: "n1", provider: "webpush", enabled: true, config: {} };

let spies: ReturnType<typeof spyOn>[] = [];
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

  spies = [
    spyOn(push, "isPushSupported").mockReturnValue(true),
    spyOn(push, "subscribeToPush").mockResolvedValue(mockSubscription),
    spyOn(push, "getExistingSubscription").mockResolvedValue({ endpoint: "https://push.example.com/sub/old" } as any),
    spyOn(api, "getNotifiers").mockResolvedValue({ notifiers: [mockNotifier] } as any),
    spyOn(api, "getVapidPublicKey").mockResolvedValue({ publicKey: "vapid-key" }),
    spyOn(api, "updateNotifier").mockResolvedValue({ notifier: mockNotifier } as any),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("usePushSubscriptionSync", () => {
  it("does nothing on mount when notifier is enabled and subscription exists", async () => {
    renderHook(() => usePushSubscriptionSync());

    await waitFor(() => {
      expect(api.getNotifiers).toHaveBeenCalled();
    });

    expect(push.subscribeToPush).not.toHaveBeenCalled();
    expect(api.updateNotifier).not.toHaveBeenCalled();
  });

  it("re-subscribes on mount when notifier is disabled", async () => {
    (api.getNotifiers as any).mockResolvedValue({ notifiers: [{ ...mockNotifier, enabled: false }] });

    renderHook(() => usePushSubscriptionSync());

    await waitFor(() => {
      expect(api.updateNotifier).toHaveBeenCalledWith("n1", { config: mockSubscription, enabled: true });
    });
  });

  it("re-subscribes on mount when browser has no active subscription", async () => {
    (push.getExistingSubscription as any).mockResolvedValue(null);

    renderHook(() => usePushSubscriptionSync());

    await waitFor(() => {
      expect(api.updateNotifier).toHaveBeenCalledWith("n1", { config: mockSubscription, enabled: true });
    });
  });

  it("does nothing on mount when push is not supported", async () => {
    (push.isPushSupported as any).mockReturnValue(false);

    renderHook(() => usePushSubscriptionSync());

    // Give effects time to run
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(api.getNotifiers).not.toHaveBeenCalled();
  });

  it("does nothing on mount when permission is not granted", async () => {
    mockNotificationPermission("default");

    renderHook(() => usePushSubscriptionSync());

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(push.subscribeToPush).not.toHaveBeenCalled();
  });

  it("does nothing on mount when no webpush notifier exists", async () => {
    (api.getNotifiers as any).mockResolvedValue({ notifiers: [] });

    renderHook(() => usePushSubscriptionSync());

    await waitFor(() => {
      expect(api.getNotifiers).toHaveBeenCalled();
    });

    expect(push.subscribeToPush).not.toHaveBeenCalled();
  });

  it("re-subscribes when controllerchange fires", async () => {
    (push.getExistingSubscription as any).mockResolvedValue({ endpoint: "old" } as any);

    renderHook(() => usePushSubscriptionSync());

    // Wait for mount check to complete (enabled notifier + existing sub = no-op)
    await waitFor(() => expect(api.getNotifiers).toHaveBeenCalledTimes(1));

    // Simulate the notifier becoming disabled after a SW update
    (api.getNotifiers as any).mockResolvedValue({ notifiers: [{ ...mockNotifier, enabled: false }] });

    // Fire controllerchange
    controllerChangeListeners.forEach((l) => l(new Event("controllerchange")));

    await waitFor(() => {
      expect(api.updateNotifier).toHaveBeenCalledWith("n1", { config: mockSubscription, enabled: true });
    });
  });

  it("removes controllerchange listener on unmount", async () => {
    const sw = navigator.serviceWorker as any;
    const { unmount } = renderHook(() => usePushSubscriptionSync());

    unmount();

    expect(sw.removeEventListener).toHaveBeenCalledWith("controllerchange", expect.any(Function));
  });

  it("swallows errors silently", async () => {
    (api.getNotifiers as any).mockRejectedValue(new Error("Network error"));

    // Should not throw
    expect(() => renderHook(() => usePushSubscriptionSync())).not.toThrow();

    await new Promise((resolve) => setTimeout(resolve, 20));
  });
});
