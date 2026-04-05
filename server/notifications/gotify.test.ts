import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { GotifyProvider } from "./gotify";
import type { NotificationContent } from "./types";

const gotify = new GotifyProvider();

describe("GotifyProvider.validateConfig", () => {
  it("accepts valid server URL and token", () => {
    const result = gotify.validateConfig({
      url: "https://gotify.example.com",
      token: "AbCdEfGhIj",
    });
    expect(result.valid).toBe(true);
  });

  it("accepts http URL", () => {
    const result = gotify.validateConfig({
      url: "http://gotify.local",
      token: "mytoken",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects missing url", () => {
    const result = gotify.validateConfig({ token: "mytoken" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("URL");
  });

  it("rejects non-http(s) URL", () => {
    const result = gotify.validateConfig({ url: "ftp://gotify.example.com", token: "mytoken" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("http");
  });

  it("rejects invalid URL", () => {
    const result = gotify.validateConfig({ url: "not-a-url", token: "mytoken" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid");
  });

  it("rejects missing token", () => {
    const result = gotify.validateConfig({ url: "https://gotify.example.com" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("token");
  });
});

describe("GotifyProvider.send", () => {
  let fetchCalls: Array<{ url: string; options: RequestInit }> = [];
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    fetchCalls = [];
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (url: string | URL | Request, options?: RequestInit) => {
      fetchCalls.push({ url: url as string, options: options ?? {} });
      return new Response(JSON.stringify({ id: 1 }), { status: 200 });
    }) as typeof fetch);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const config = { url: "https://gotify.example.com", token: "myapptoken" };

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

  it("posts to /message endpoint with token in X-Gotify-Key header", async () => {
    await gotify.send(config, sampleContent);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe("https://gotify.example.com/message");
    const headers = fetchCalls[0].options.headers as Record<string, string>;
    expect(headers["X-Gotify-Key"]).toBe("myapptoken");
    expect(fetchCalls[0].url).not.toContain("token=");
  });

  it("strips trailing slash from base URL", async () => {
    await gotify.send({ url: "https://gotify.example.com/", token: "mytoken" }, sampleContent);
    expect(fetchCalls[0].url).toBe("https://gotify.example.com/message");
  });

  it("payload includes title and message", async () => {
    await gotify.send(config, sampleContent);
    const body = JSON.parse(fetchCalls[0].options.body as string);
    expect(body.title).toContain("Remindarr");
    expect(body.message).toContain("Breaking Bad");
    expect(body.message).toContain("S01E03");
    expect(body.message).toContain("The Matrix");
    expect(body.priority).toBe(5);
  });

  it("skips sending when content is empty", async () => {
    await gotify.send(config, { date: "2026-03-12", episodes: [], movies: [] });
    expect(fetchCalls).toHaveLength(0);
  });

  it("sends when content has only streaming alerts", async () => {
    const alertContent: NotificationContent = {
      date: "2026-04-05",
      episodes: [],
      movies: [],
      streamingAlerts: [{ titleId: "tt123", title: "Inception", posterUrl: null, providerName: "Netflix" }],
    };
    await gotify.send(config, alertContent);
    expect(fetchCalls).toHaveLength(1);
    const body = JSON.parse(fetchCalls[0].options.body as string);
    expect(body.title).toContain("now streaming");
    expect(body.message).toContain("Inception");
    expect(body.message).toContain("Netflix");
  });

  it("throws on non-2xx response", async () => {
    fetchSpy.mockImplementation(async () => new Response("Unauthorized", { status: 401 }));
    await expect(gotify.send(config, sampleContent)).rejects.toThrow("401");
  });
});
