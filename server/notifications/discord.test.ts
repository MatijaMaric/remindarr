import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { DiscordProvider } from "./discord";
import type { NotificationContent } from "./types";

const discord = new DiscordProvider();

describe("DiscordProvider.validateConfig", () => {
  it("accepts valid Discord webhook URL", () => {
    const result = discord.validateConfig({
      webhookUrl:
        "https://discord.com/api/webhooks/123456789/abcdefghijklmnop",
    });
    expect(result.valid).toBe(true);
  });

  it("accepts discordapp.com URL", () => {
    const result = discord.validateConfig({
      webhookUrl:
        "https://discordapp.com/api/webhooks/123456789/abcdefghijklmnop",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects missing webhookUrl", () => {
    const result = discord.validateConfig({});
    expect(result.valid).toBe(false);
    expect(result.error).toContain("required");
  });

  it("rejects invalid URL", () => {
    const result = discord.validateConfig({
      webhookUrl: "https://example.com/not-a-webhook",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid");
  });

  it("rejects non-https URL", () => {
    const result = discord.validateConfig({
      webhookUrl:
        "http://discord.com/api/webhooks/123456789/abcdefghijklmnop",
    });
    expect(result.valid).toBe(false);
  });
});

describe("DiscordProvider.send", () => {
  let fetchCalls: Array<{ url: string; options: any }> = [];
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    fetchCalls = [];
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (url: string | URL | Request, options?: any) => {
      fetchCalls.push({ url: url as string, options });
      return new Response("", { status: 204 });
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
        posterUrl: "/abc123.jpg",
        offers: [
          { providerName: "Netflix", providerIconUrl: null },
        ],
      },
    ],
    movies: [
      {
        title: "The Matrix",
        releaseYear: 1999,
        posterUrl: "/matrix.jpg",
        offers: [
          { providerName: "HBO Max", providerIconUrl: null },
        ],
      },
    ],
  };

  it("sends embeds to webhook URL", async () => {
    await discord.send(
      { webhookUrl: "https://discord.com/api/webhooks/123/abc" },
      sampleContent
    );

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe(
      "https://discord.com/api/webhooks/123/abc"
    );

    const body = JSON.parse(fetchCalls[0].options.body);
    expect(body.username).toBe("Remindarr");
    expect(body.embeds).toBeArray();
    expect(body.embeds.length).toBeGreaterThan(0);

    // Header embed
    expect(body.embeds[0].title).toContain("2026-03-12");

    // Episode embed
    const epEmbed = body.embeds.find((e: any) =>
      e.title === "Breaking Bad"
    );
    expect(epEmbed).toBeDefined();
    expect(epEmbed.description).toContain("S01E03");

    // Movie embed
    const movieEmbed = body.embeds.find((e: any) =>
      e.title === "The Matrix"
    );
    expect(movieEmbed).toBeDefined();
  });

  it("skips sending when content is empty", async () => {
    await discord.send(
      { webhookUrl: "https://discord.com/api/webhooks/123/abc" },
      { date: "2026-03-12", episodes: [], movies: [] }
    );

    expect(fetchCalls).toHaveLength(0);
  });

  it("throws on non-2xx response", async () => {
    fetchSpy.mockImplementation(async () => {
      return new Response("Bad Request", { status: 400 });
    });

    await expect(
      discord.send(
        { webhookUrl: "https://discord.com/api/webhooks/123/abc" },
        sampleContent
      )
    ).rejects.toThrow("Discord webhook failed");
  });
});
