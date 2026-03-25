import { describe, it, expect, mock } from "bun:test";

// Use dynamic import to avoid module resolution races when Bun runs
// test files in parallel (same pattern as ReelsPage.test.tsx).
const { urlBase64ToUint8Array, subscribeToPush } = await import("./push");

describe("urlBase64ToUint8Array", () => {
  it("converts a base64url string to Uint8Array", () => {
    // Known test vector: "AQAB" (base64url) = [1, 0, 1]
    const result = urlBase64ToUint8Array("AQAB");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result[0]).toBe(1);
    expect(result[1]).toBe(0);
    expect(result[2]).toBe(1);
  });

  it("handles base64url characters (- and _)", () => {
    // "-" should become "+" and "_" should become "/"
    const result = urlBase64ToUint8Array("A-B_");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(3);
  });

  it("adds padding as needed", () => {
    // "AA" needs 2 padding chars
    const result = urlBase64ToUint8Array("AA");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result[0]).toBe(0);
  });
});

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
