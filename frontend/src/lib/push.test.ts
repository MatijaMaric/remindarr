import { describe, it, expect, mock, afterEach } from "bun:test";
import { subscribeToPush } from "./push";

const savedServiceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");

function setupServiceWorkerMock(opts: {
  existingSubscription?: { unsubscribe: () => Promise<boolean> } | null;
  newSubscription?: { toJSON: () => Record<string, any> };
}) {
  const mockSubscribe = mock(() => Promise.resolve(opts.newSubscription));
  const mockGetSubscription = mock(() => Promise.resolve(opts.existingSubscription ?? null));

  Object.defineProperty(navigator, "serviceWorker", {
    value: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: mockGetSubscription,
          subscribe: mockSubscribe,
        },
      }),
    },
    configurable: true,
  });

  return { mockSubscribe, mockGetSubscription };
}

const VALID_SUBSCRIPTION = {
  toJSON: () => ({
    endpoint: "https://fcm.example.com/send/fresh",
    keys: { p256dh: "newp256dh", auth: "newauth" },
  }),
};

describe("subscribeToPush", () => {
  afterEach(() => {
    // Restore navigator.serviceWorker to avoid leaked state between tests
    if (savedServiceWorkerDescriptor) {
      Object.defineProperty(navigator, "serviceWorker", savedServiceWorkerDescriptor);
    } else {
      delete (navigator as any).serviceWorker;
    }
  });

  it("unsubscribes existing subscription before creating new one", async () => {
    const mockUnsubscribe = mock(() => Promise.resolve(true));
    const { mockSubscribe, mockGetSubscription } = setupServiceWorkerMock({
      existingSubscription: { unsubscribe: mockUnsubscribe },
      newSubscription: VALID_SUBSCRIPTION,
    });

    const result = await subscribeToPush("test-vapid-key");

    expect(mockGetSubscription).toHaveBeenCalled();
    expect(mockUnsubscribe).toHaveBeenCalled();
    expect(mockSubscribe).toHaveBeenCalled();
    expect(result.endpoint).toBe("https://fcm.example.com/send/fresh");
    expect(result.p256dh).toBe("newp256dh");
    expect(result.auth).toBe("newauth");
  });

  it("proceeds even if existing unsubscribe fails", async () => {
    const mockUnsubscribe = mock(() => Promise.reject(new Error("unsubscribe failed")));
    const { mockSubscribe } = setupServiceWorkerMock({
      existingSubscription: { unsubscribe: mockUnsubscribe },
      newSubscription: VALID_SUBSCRIPTION,
    });

    const result = await subscribeToPush("test-vapid-key");

    expect(mockUnsubscribe).toHaveBeenCalled();
    expect(mockSubscribe).toHaveBeenCalled();
    expect(result.endpoint).toBe("https://fcm.example.com/send/fresh");
  });

  it("works when no existing subscription", async () => {
    const { mockSubscribe, mockGetSubscription } = setupServiceWorkerMock({
      existingSubscription: null,
      newSubscription: VALID_SUBSCRIPTION,
    });

    const result = await subscribeToPush("test-vapid-key");

    expect(mockGetSubscription).toHaveBeenCalled();
    expect(mockSubscribe).toHaveBeenCalled();
    expect(result.endpoint).toBe("https://fcm.example.com/send/fresh");
  });

  it("throws when subscription has missing keys", async () => {
    setupServiceWorkerMock({
      newSubscription: {
        toJSON: () => ({ endpoint: "https://fcm.example.com/send/x", keys: {} }),
      },
    });

    await expect(subscribeToPush("test-vapid-key")).rejects.toThrow("Invalid push subscription");
  });
});
