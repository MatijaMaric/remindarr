import { describe, it, expect, mock, beforeEach } from "bun:test";

const mockGetSubscription = mock();
const mockSubscribe = mock();

mock.module("./push-registration", () => ({
  getRegistration: () =>
    Promise.resolve({
      pushManager: {
        getSubscription: mockGetSubscription,
        subscribe: mockSubscribe,
      },
    }),
}));

// Must import AFTER mock.module
const { subscribeToPush } = await import("./push");

const VALID_SUBSCRIPTION = {
  toJSON: () => ({
    endpoint: "https://fcm.example.com/send/fresh",
    keys: { p256dh: "newp256dh", auth: "newauth" },
  }),
};

describe("subscribeToPush", () => {
  beforeEach(() => {
    mockGetSubscription.mockReset();
    mockSubscribe.mockReset();
  });

  it("unsubscribes existing subscription before creating new one", async () => {
    const mockUnsubscribe = mock(() => Promise.resolve(true));
    mockGetSubscription.mockImplementation(() =>
      Promise.resolve({ unsubscribe: mockUnsubscribe })
    );
    mockSubscribe.mockImplementation(() =>
      Promise.resolve(VALID_SUBSCRIPTION)
    );

    const result = await subscribeToPush("test-vapid-key");

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
    mockGetSubscription.mockImplementation(() =>
      Promise.resolve({ unsubscribe: mockUnsubscribe })
    );
    mockSubscribe.mockImplementation(() =>
      Promise.resolve(VALID_SUBSCRIPTION)
    );

    const result = await subscribeToPush("test-vapid-key");

    expect(mockUnsubscribe).toHaveBeenCalled();
    expect(mockSubscribe).toHaveBeenCalled();
    expect(result.endpoint).toBe("https://fcm.example.com/send/fresh");
  });

  it("works when no existing subscription", async () => {
    mockGetSubscription.mockImplementation(() => Promise.resolve(null));
    mockSubscribe.mockImplementation(() =>
      Promise.resolve(VALID_SUBSCRIPTION)
    );

    const result = await subscribeToPush("test-vapid-key");

    expect(mockGetSubscription).toHaveBeenCalled();
    expect(mockSubscribe).toHaveBeenCalled();
    expect(result.endpoint).toBe("https://fcm.example.com/send/fresh");
  });

  it("throws when subscription has missing keys", async () => {
    mockGetSubscription.mockImplementation(() => Promise.resolve(null));
    mockSubscribe.mockImplementation(() =>
      Promise.resolve({
        toJSON: () => ({
          endpoint: "https://fcm.example.com/send/x",
          keys: {},
        }),
      })
    );

    await expect(subscribeToPush("test-vapid-key")).rejects.toThrow(
      "Invalid push subscription"
    );
  });
});
