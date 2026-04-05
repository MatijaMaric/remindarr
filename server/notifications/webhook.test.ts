import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { WebhookProvider } from "./webhook";
import type { NotificationContent } from "./types";

const webhook = new WebhookProvider();

describe("WebhookProvider.validateConfig", () => {
  it("accepts valid https URL", () => {
    const result = webhook.validateConfig({ url: "https://example.com/hook" });
    expect(result.valid).toBe(true);
  });

  it("accepts http URL", () => {
    const result = webhook.validateConfig({ url: "http://internal.local/hook" });
    expect(result.valid).toBe(true);
  });

  it("rejects missing url", () => {
    const result = webhook.validateConfig({});
    expect(result.valid).toBe(false);
    expect(result.error).toContain("required");
  });

  it("rejects non-http(s) URL", () => {
    const result = webhook.validateConfig({ url: "ftp://example.com/hook" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("http");
  });

  it("rejects invalid URL", () => {
    const result = webhook.validateConfig({ url: "not-a-url" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid");
  });
});

describe("WebhookProvider.send", () => {
  let fetchCalls: Array<{ url: string; options: RequestInit }> = [];
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    fetchCalls = [];
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (url: string | URL | Request, options?: RequestInit) => {
      fetchCalls.push({ url: url as string, options: options ?? {} });
      return new Response("ok", { status: 200 });
    }) as typeof fetch);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const sampleContent: NotificationContent = {
    date: "2026-03-12",
    episodes: [
      {
        showTitle: "Breaking Bad",
        seasonNumber: 1,
        episodeNumber: 3,
        episodeName: "...And the Bag's in the River",
        posterUrl: null,
        offers: [{ providerName: "Netflix", providerIconUrl: null }],
      },
    ],
    movies: [
      {
        title: "The Matrix",
        releaseYear: 1999,
        posterUrl: null,
        offers: [{ providerName: "HBO Max", providerIconUrl: null }],
      },
    ],
  };

  it("posts JSON payload to the webhook URL", async () => {
    await webhook.send({ url: "https://example.com/hook" }, sampleContent);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe("https://example.com/hook");
    const body = JSON.parse(fetchCalls[0].options.body as string);
    expect(body.source).toBe("remindarr");
    expect(body.date).toBe("2026-03-12");
    expect(body.episodes).toBeArray();
    expect(body.movies).toBeArray();
  });

  it("payload includes episode and movie details", async () => {
    await webhook.send({ url: "https://example.com/hook" }, sampleContent);
    const body = JSON.parse(fetchCalls[0].options.body as string);
    expect(body.episodes[0].show).toBe("Breaking Bad");
    expect(body.episodes[0].season).toBe(1);
    expect(body.episodes[0].episode).toBe(3);
    expect(body.movies[0].title).toBe("The Matrix");
    expect(body.movies[0].year).toBe(1999);
  });

  it("includes X-Remindarr-Signature header when secret provided", async () => {
    await webhook.send({ url: "https://example.com/hook", secret: "my-secret" }, sampleContent);
    const headers = fetchCalls[0].options.headers as Record<string, string>;
    expect(headers["X-Remindarr-Signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("omits signature header when no secret", async () => {
    await webhook.send({ url: "https://example.com/hook" }, sampleContent);
    const headers = fetchCalls[0].options.headers as Record<string, string>;
    expect(headers["X-Remindarr-Signature"]).toBeUndefined();
  });

  it("includes User-Agent header", async () => {
    await webhook.send({ url: "https://example.com/hook" }, sampleContent);
    const headers = fetchCalls[0].options.headers as Record<string, string>;
    expect(headers["User-Agent"]).toContain("Remindarr");
  });

  it("skips sending when content is empty", async () => {
    await webhook.send({ url: "https://example.com/hook" }, { date: "2026-03-12", episodes: [], movies: [] });
    expect(fetchCalls).toHaveLength(0);
  });

  it("throws on non-2xx response", async () => {
    fetchSpy.mockImplementation(async () => new Response("Server Error", { status: 500 }));
    await expect(webhook.send({ url: "https://example.com/hook" }, sampleContent)).rejects.toThrow("500");
  });

  it("signature is deterministic for same body and secret", async () => {
    await webhook.send({ url: "https://example.com/hook", secret: "abc" }, sampleContent);
    const sig1 = (fetchCalls[0].options.headers as Record<string, string>)["X-Remindarr-Signature"];
    await webhook.send({ url: "https://example.com/hook", secret: "abc" }, sampleContent);
    const sig2 = (fetchCalls[1].options.headers as Record<string, string>)["X-Remindarr-Signature"];
    expect(sig1).toBe(sig2);
  });
});
