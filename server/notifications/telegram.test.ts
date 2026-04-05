import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { TelegramProvider } from "./telegram";
import type { NotificationContent } from "./types";

const telegram = new TelegramProvider();

describe("TelegramProvider.validateConfig", () => {
  it("accepts valid bot token and numeric chat ID", () => {
    const result = telegram.validateConfig({
      botToken: "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ_abcde12345",
      chatId: "-1001234567890",
    });
    expect(result.valid).toBe(true);
  });

  it("accepts positive chat ID", () => {
    const result = telegram.validateConfig({
      botToken: "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ_abcde12345",
      chatId: "987654321",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects missing botToken", () => {
    const result = telegram.validateConfig({ chatId: "-1001234567890" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("token");
  });

  it("rejects invalid botToken format", () => {
    const result = telegram.validateConfig({ botToken: "bad-token", chatId: "-1001234567890" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid bot token");
  });

  it("rejects missing chatId", () => {
    const result = telegram.validateConfig({
      botToken: "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ_abcde12345",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Chat ID");
  });

  it("rejects non-numeric chatId", () => {
    const result = telegram.validateConfig({
      botToken: "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ_abcde12345",
      chatId: "my_channel",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("number");
  });
});

describe("TelegramProvider.send", () => {
  let fetchCalls: Array<{ url: string; options: RequestInit }> = [];
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    fetchCalls = [];
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (url: string | URL | Request, options?: RequestInit) => {
      fetchCalls.push({ url: url as string, options: options ?? {} });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const config = {
    botToken: "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ_abcde12345",
    chatId: "-1001234567890",
  };

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

  it("posts to Telegram sendMessage endpoint", async () => {
    await telegram.send(config, sampleContent);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toContain("api.telegram.org");
    expect(fetchCalls[0].url).toContain("sendMessage");
  });

  it("sends HTML parse_mode", async () => {
    await telegram.send(config, sampleContent);
    const body = JSON.parse(fetchCalls[0].options.body as string);
    expect(body.parse_mode).toBe("HTML");
    expect(body.chat_id).toBe(config.chatId);
  });

  it("message contains episode codes and movie title", async () => {
    await telegram.send(config, sampleContent);
    const body = JSON.parse(fetchCalls[0].options.body as string);
    expect(body.text).toContain("S01E03");
    expect(body.text).toContain("The Matrix");
    expect(body.text).toContain("Remindarr");
  });

  it("escapes HTML special characters in show titles", async () => {
    const content: NotificationContent = {
      date: "2026-03-12",
      episodes: [],
      movies: [
        {
          title: "AT&T <Story>",
          releaseYear: 2025,
          posterUrl: null,
          offers: [],
        },
      ],
    };
    await telegram.send(config, content);
    const body = JSON.parse(fetchCalls[0].options.body as string);
    expect(body.text).toContain("AT&amp;T");
    expect(body.text).toContain("&lt;Story&gt;");
  });

  it("skips sending when content is empty", async () => {
    await telegram.send(config, { date: "2026-03-12", episodes: [], movies: [] });
    expect(fetchCalls).toHaveLength(0);
  });

  it("sends when content has only streaming alerts", async () => {
    const alertContent: NotificationContent = {
      date: "2026-04-05",
      episodes: [],
      movies: [],
      streamingAlerts: [{ titleId: "tt123", title: "Inception", posterUrl: null, providerName: "Netflix" }],
    };
    await telegram.send(config, alertContent);
    expect(fetchCalls).toHaveLength(1);
    const body = JSON.parse(fetchCalls[0].options.body as string);
    expect(body.text).toContain("now streaming");
    expect(body.text).toContain("Inception");
    expect(body.text).toContain("Netflix");
  });

  it("throws on non-2xx response", async () => {
    fetchSpy.mockImplementation(async () =>
      new Response(JSON.stringify({ ok: false, description: "Bad Request" }), { status: 400 })
    );
    await expect(telegram.send(config, sampleContent)).rejects.toThrow("400");
  });
});
