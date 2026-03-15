import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { WebPushProvider, SubscriptionExpiredError } from "./webpush";
import type { NotificationContent } from "./types";

// Mock web-push module
mock.module("web-push", () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async () => ({ statusCode: 201 }),
  },
}));

// Mock vapid module
mock.module("./vapid", () => ({
  getVapidKeys: () => ({
    publicKey: "test-public-key",
    privateKey: "test-private-key",
    subject: "mailto:test@example.com",
  }),
}));

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
