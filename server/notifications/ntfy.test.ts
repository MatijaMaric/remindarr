import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { NtfyProvider } from "./ntfy";
import type { NotificationContent } from "./types";

const ntfy = new NtfyProvider();

describe("NtfyProvider.validateConfig", () => {
  it("accepts valid topic URL", () => {
    const result = ntfy.validateConfig({ url: "https://ntfy.sh/my-topic" });
    expect(result.valid).toBe(true);
  });

  it("accepts self-hosted URL with topic", () => {
    const result = ntfy.validateConfig({ url: "https://ntfy.example.com/alerts" });
    expect(result.valid).toBe(true);
  });

  it("rejects missing url", () => {
    const result = ntfy.validateConfig({});
    expect(result.valid).toBe(false);
    expect(result.error).toContain("required");
  });

  it("rejects URL without topic path", () => {
    const result = ntfy.validateConfig({ url: "https://ntfy.sh/" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("topic");
  });

  it("rejects URL without topic path (bare host)", () => {
    const result = ntfy.validateConfig({ url: "https://ntfy.sh" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("topic");
  });

  it("rejects non-http(s) URL", () => {
    const result = ntfy.validateConfig({ url: "ftp://ntfy.sh/my-topic" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("http");
  });

  it("rejects invalid URL string", () => {
    const result = ntfy.validateConfig({ url: "not-a-url" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid");
  });

  it("accepts token when provided", () => {
    const result = ntfy.validateConfig({ url: "https://ntfy.sh/secure", token: "tk_abc123" });
    expect(result.valid).toBe(true);
  });
});

describe("NtfyProvider.send", () => {
  let fetchCalls: Array<{ url: string; options: RequestInit }> = [];
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    fetchCalls = [];
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (url: string | URL | Request, options?: RequestInit) => {
      fetchCalls.push({ url: url as string, options: options ?? {} });
      return new Response("", { status: 200 });
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

  it("posts to the topic URL", async () => {
    await ntfy.send({ url: "https://ntfy.sh/my-topic" }, sampleContent);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe("https://ntfy.sh/my-topic");
  });

  it("sets Title and Tags headers", async () => {
    await ntfy.send({ url: "https://ntfy.sh/my-topic" }, sampleContent);
    const headers = fetchCalls[0].options.headers as Record<string, string>;
    expect(headers["Title"]).toContain("Remindarr");
    expect(headers["Tags"]).toContain("tv");
  });

  it("includes Authorization header when token is provided", async () => {
    await ntfy.send({ url: "https://ntfy.sh/my-topic", token: "tk_secret" }, sampleContent);
    const headers = fetchCalls[0].options.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer tk_secret");
  });

  it("omits Authorization header when no token", async () => {
    await ntfy.send({ url: "https://ntfy.sh/my-topic" }, sampleContent);
    const headers = fetchCalls[0].options.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("message body includes show and movie info", async () => {
    await ntfy.send({ url: "https://ntfy.sh/my-topic" }, sampleContent);
    const body = fetchCalls[0].options.body as string;
    expect(body).toContain("Breaking Bad");
    expect(body).toContain("S01E03");
    expect(body).toContain("The Matrix");
  });

  it("skips sending when content is empty", async () => {
    await ntfy.send({ url: "https://ntfy.sh/my-topic" }, { date: "2026-03-12", episodes: [], movies: [] });
    expect(fetchCalls).toHaveLength(0);
  });

  it("throws on non-2xx response", async () => {
    fetchSpy.mockImplementation(async () => new Response("Forbidden", { status: 403 }));
    await expect(ntfy.send({ url: "https://ntfy.sh/my-topic" }, sampleContent)).rejects.toThrow("403");
  });
});
