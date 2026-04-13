import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { CONFIG } from "../config";
import type { NotificationContent } from "./types";

// Mock web-push module (include generateVAPIDKeys so the mock doesn't break
// vapid.test.ts if it leaks across files in the same bun process)
mock.module("web-push", () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async () => ({ statusCode: 201 }),
    generateVAPIDKeys: () => ({
      publicKey: "mock-generated-public",
      privateKey: "mock-generated-private",
    }),
  },
}));

// Use CONFIG values so the real getVapidKeys() returns them without DB access.
// This avoids mock.module("./vapid") which permanently poisons the module
// registry and breaks vapid.test.ts when both files run in the same process.
const savedVapidPublicKey = CONFIG.VAPID_PUBLIC_KEY;
const savedVapidPrivateKey = CONFIG.VAPID_PRIVATE_KEY;
const savedVapidSubject = CONFIG.VAPID_SUBJECT;

CONFIG.VAPID_PUBLIC_KEY = "test-public-key";
CONFIG.VAPID_PRIVATE_KEY = "test-private-key";
CONFIG.VAPID_SUBJECT = "mailto:test@example.com";

const { WebPushProvider, SubscriptionExpiredError } = await import("./webpush");
const provider = new WebPushProvider();

const sampleContent: NotificationContent = {
  date: "2026-03-15",
  episodes: [
    {
      showTitle: "Breaking Bad",
      seasonNumber: 1,
      episodeNumber: 3,
      episodeName: "...And the Bag's in the River",
      posterUrl: "/abc123.jpg",
      offers: [{ providerName: "Netflix", providerIconUrl: null }],
    },
  ],
  movies: [
    {
      title: "The Matrix",
      releaseYear: 1999,
      posterUrl: "/matrix.jpg",
      offers: [{ providerName: "HBO Max", providerIconUrl: null }],
    },
  ],
};

const validConfig = {
  endpoint: "https://push.example.com/abc123",
  p256dh: "test-p256dh-key",
  auth: "test-auth-key",
};

beforeEach(() => {
  CONFIG.VAPID_PUBLIC_KEY = "test-public-key";
  CONFIG.VAPID_PRIVATE_KEY = "test-private-key";
  CONFIG.VAPID_SUBJECT = "mailto:test@example.com";
});

afterEach(() => {
  CONFIG.VAPID_PUBLIC_KEY = savedVapidPublicKey;
  CONFIG.VAPID_PRIVATE_KEY = savedVapidPrivateKey;
  CONFIG.VAPID_SUBJECT = savedVapidSubject;
});

describe("WebPushProvider.validateConfig", () => {
  it("accepts valid config", () => {
    const result = provider.validateConfig(validConfig);
    expect(result.valid).toBe(true);
  });

  it("rejects missing endpoint", () => {
    const result = provider.validateConfig({ p256dh: "x", auth: "y" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("endpoint");
  });

  it("rejects missing p256dh", () => {
    const result = provider.validateConfig({ endpoint: "x", auth: "y" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("p256dh");
  });

  it("rejects missing auth", () => {
    const result = provider.validateConfig({ endpoint: "x", p256dh: "y" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("auth");
  });
});

describe("WebPushProvider.send", () => {
  it("sends push notification with correct payload", async () => {
    const webpush = await import("web-push");
    let sentPayload: string | undefined;
    const sendSpy = spyOn(webpush.default, "sendNotification").mockImplementation(
      async (_sub: any, payload: any) => {
        sentPayload = payload;
        return { statusCode: 201 } as any;
      }
    );

    await provider.send(validConfig, sampleContent);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(sentPayload!);
    expect(parsed.title).toContain("2 new releases");
    expect(parsed.body).toContain("Breaking Bad");
    expect(parsed.body).toContain("The Matrix");
    expect(parsed.icon).toBe("/pwa-192x192.png");

    sendSpy.mockRestore();
  });

  it("skips sending when content is empty", async () => {
    const webpush = await import("web-push");
    const sendSpy = spyOn(webpush.default, "sendNotification");

    await provider.send(validConfig, { date: "2026-03-15", episodes: [], movies: [] });

    expect(sendSpy).not.toHaveBeenCalled();
    sendSpy.mockRestore();
  });

  it("throws SubscriptionExpiredError on 410", async () => {
    const webpush = await import("web-push");
    const sendSpy = spyOn(webpush.default, "sendNotification").mockImplementation(async () => {
      const err: any = new Error("Gone");
      err.statusCode = 410;
      throw err;
    });

    await expect(provider.send(validConfig, sampleContent)).rejects.toThrow(
      SubscriptionExpiredError
    );

    sendSpy.mockRestore();
  });

  it("throws generic error on other failures", async () => {
    const webpush = await import("web-push");
    const sendSpy = spyOn(webpush.default, "sendNotification").mockImplementation(async () => {
      const err: any = new Error("Server Error");
      err.statusCode = 500;
      err.body = "Internal Server Error";
      throw err;
    });

    await expect(provider.send(validConfig, sampleContent)).rejects.toThrow("Web push failed");

    sendSpy.mockRestore();
  });
});
