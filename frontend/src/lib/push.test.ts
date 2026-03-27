import { describe, it, expect, mock } from "bun:test";
import { subscribeToPush } from "./push";

function makePushManager(opts: {
  existingSubscription?: { unsubscribe: () => Promise<boolean> } | null;
  newSubscription?: { toJSON: () => Record<string, unknown> };
}) {
  const mockSubscribe = mock(() => Promise.resolve(opts.newSubscription));
  const mockGetSubscription = mock(() =>
    Promise.resolve(opts.existingSubscription ?? null)
  );

  const pushManager = {
    getSubscription: mockGetSubscription,
    subscribe: mockSubscribe,
  } as unknown as Pick<PushManager, "getSubscription" | "subscribe">;

  return { mockSubscribe, mockGetSubscription, pushManager };
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
    const { mockSubscribe, mockGetSubscription, pushManager } = makePushManager({
      existingSubscription: { unsubscribe: mockUnsubscribe },
      newSubscription: VALID_SUBSCRIPTION,
    });

    const result = await subscribeToPush("test-vapid-key", pushManager);

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
    const { mockSubscribe, pushManager } = makePushManager({
      existingSubscription: { unsubscribe: mockUnsubscribe },
      newSubscription: VALID_SUBSCRIPTION,
    });

    const result = await subscribeToPush("test-vapid-key", pushManager);

    expect(mockUnsubscribe).toHaveBeenCalled();
    expect(mockSubscribe).toHaveBeenCalled();
    expect(result.endpoint).toBe("https://fcm.example.com/send/fresh");
  });

  it("works when no existing subscription", async () => {
    const { mockSubscribe, mockGetSubscription, pushManager } = makePushManager({
      existingSubscription: null,
      newSubscription: VALID_SUBSCRIPTION,
    });

    const result = await subscribeToPush("test-vapid-key", pushManager);

    expect(mockGetSubscription).toHaveBeenCalled();
    expect(mockSubscribe).toHaveBeenCalled();
    expect(result.endpoint).toBe("https://fcm.example.com/send/fresh");
  });

  it("throws when subscription has missing keys", async () => {
    const { pushManager } = makePushManager({
      newSubscription: {
        toJSON: () => ({ endpoint: "https://fcm.example.com/send/x", keys: {} }),
      },
    });

    await expect(subscribeToPush("test-vapid-key", pushManager)).rejects.toThrow(
      "Invalid push subscription"
    );
  });
});
