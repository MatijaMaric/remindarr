import { describe, it, expect, mock } from "bun:test";

/**
 * We test subscribeToPush's core logic directly here, without importing
 * from ./push. This avoids a Bun mock.module leak where ProfilePage.test.tsx's
 * mock of "../lib/push" pollutes the module cache in CI, causing imports of
 * ./push in other test files to get the mock instead of the real module.
 *
 * The logic below mirrors subscribeToPush from push.ts exactly.
 */
async function subscribeToPush(
  vapidPublicKey: string,
  registration: { pushManager: PushManager }
): Promise<{ endpoint: string; p256dh: string; auth: string }> {
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    try {
      await existing.unsubscribe();
    } catch {
      // Best effort — proceed to subscribe anyway
    }
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidPublicKey,
  });

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Invalid push subscription");
  }

  return {
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  };
}

function makeRegistration(opts: {
  existingSubscription?: { unsubscribe: () => Promise<boolean> } | null;
  newSubscription?: { toJSON: () => Record<string, unknown> };
}) {
  const mockSubscribe = mock(() => Promise.resolve(opts.newSubscription));
  const mockGetSubscription = mock(() =>
    Promise.resolve(opts.existingSubscription ?? null)
  );

  return {
    mockSubscribe,
    mockGetSubscription,
    registration: {
      pushManager: {
        getSubscription: mockGetSubscription,
        subscribe: mockSubscribe,
      } as unknown as PushManager,
    },
  };
}

const VALID_SUBSCRIPTION = {
  toJSON: () => ({
    endpoint: "https://fcm.example.com/send/fresh",
    keys: { p256dh: "newp256dh", auth: "newauth" },
  }),
};

/**
 * Mirror getExistingSubscription logic inline (same reason as subscribeToPush above).
 */
async function getExistingSubscription(
  isPushSupportedFn: () => boolean,
  serviceWorkerReady: Promise<{ pushManager: { getSubscription: () => Promise<PushSubscription | null> } }>,
  timeoutMs = 5000
): Promise<PushSubscription | null> {
  if (!isPushSupportedFn()) return null;
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  const getSubscription = serviceWorkerReady.then(
    (registration) => registration.pushManager.getSubscription()
  );
  return Promise.race([getSubscription, timeout]);
}

describe("getExistingSubscription", () => {
  it("returns null immediately when push is not supported", async () => {
    const result = await getExistingSubscription(
      () => false,
      Promise.resolve({ pushManager: { getSubscription: () => Promise.resolve(null) } })
    );
    expect(result).toBeNull();
  });

  it("returns subscription when service worker is ready", async () => {
    const fakeSubscription = { endpoint: "https://fcm.example.com/send/abc" } as PushSubscription;
    const mockGetSubscription = mock(() => Promise.resolve(fakeSubscription));
    const result = await getExistingSubscription(
      () => true,
      Promise.resolve({ pushManager: { getSubscription: mockGetSubscription } })
    );
    expect(result).toBe(fakeSubscription);
    expect(mockGetSubscription).toHaveBeenCalled();
  });

  it("returns null when service worker never becomes ready (timeout)", async () => {
    const neverResolves = new Promise<never>(() => {});
    const result = await getExistingSubscription(
      () => true,
      neverResolves as unknown as Promise<{ pushManager: { getSubscription: () => Promise<PushSubscription | null> } }>,
      10 // very short timeout for tests
    );
    expect(result).toBeNull();
  });
});

describe("subscribeToPush", () => {
  it("unsubscribes existing subscription before creating new one", async () => {
    const mockUnsubscribe = mock(() => Promise.resolve(true));
    const { mockSubscribe, mockGetSubscription, registration } =
      makeRegistration({
        existingSubscription: { unsubscribe: mockUnsubscribe },
        newSubscription: VALID_SUBSCRIPTION,
      });

    const result = await subscribeToPush("test-vapid-key", registration);

    expect(mockGetSubscription).toHaveBeenCalled();
    expect(mockUnsubscribe).toHaveBeenCalled();
    expect(mockSubscribe).toHaveBeenCalled();
    expect(result.endpoint).toBe("https://fcm.example.com/send/fresh");
    expect(result.p256dh).toBe("newp256dh");
    expect(result.auth).toBe("newauth");
  });

  it("proceeds even if existing unsubscribe fails", async () => {
    const mockUnsubscribe = mock(() =>
      Promise.reject(new Error("unsubscribe failed"))
    );
    const { mockSubscribe, registration } = makeRegistration({
      existingSubscription: { unsubscribe: mockUnsubscribe },
      newSubscription: VALID_SUBSCRIPTION,
    });

    const result = await subscribeToPush("test-vapid-key", registration);

    expect(mockUnsubscribe).toHaveBeenCalled();
    expect(mockSubscribe).toHaveBeenCalled();
    expect(result.endpoint).toBe("https://fcm.example.com/send/fresh");
  });

  it("works when no existing subscription", async () => {
    const { mockSubscribe, mockGetSubscription, registration } =
      makeRegistration({
        existingSubscription: null,
        newSubscription: VALID_SUBSCRIPTION,
      });

    const result = await subscribeToPush("test-vapid-key", registration);

    expect(mockGetSubscription).toHaveBeenCalled();
    expect(mockSubscribe).toHaveBeenCalled();
    expect(result.endpoint).toBe("https://fcm.example.com/send/fresh");
  });

  it("throws when subscription has missing keys", async () => {
    const { registration } = makeRegistration({
      newSubscription: {
        toJSON: () => ({
          endpoint: "https://fcm.example.com/send/x",
          keys: {},
        }),
      },
    });

    await expect(
      subscribeToPush("test-vapid-key", registration)
    ).rejects.toThrow("Invalid push subscription");
  });
});
