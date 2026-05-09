/**
 * Cross-provider notification eval.
 *
 * Purpose: given a canonical NotificationContent fixture, verify that every
 * provider handles the streaming-alerts guard correctly and produces stable
 * output. This catches regressions that per-provider unit tests miss when a
 * provider is refactored or a new guard is introduced.
 *
 * Not a replacement for per-provider unit tests — those live in
 * server/notifications/*.test.ts. This eval is about cross-cutting invariants.
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { DiscordProvider } from "../../server/notifications/discord";
import { TelegramProvider } from "../../server/notifications/telegram";
import { GotifyProvider } from "../../server/notifications/gotify";
import { NtfyProvider } from "../../server/notifications/ntfy";
import { WebhookProvider } from "../../server/notifications/webhook";
import type { NotificationContent, NotificationProvider } from "../../server/notifications/types";

// ─── Canonical fixtures ──────────────────────────────────────────────────────

const episodeContent: NotificationContent = {
  date: "2026-01-15",
  episodes: [
    {
      showTitle: "Breaking Bad",
      seasonNumber: 2,
      episodeNumber: 7,
      episodeName: "Negro y Azul",
      posterUrl: "/abc123.jpg",
      offers: [{ providerName: "Netflix", providerIconUrl: null }],
    },
  ],
  movies: [],
  streamingAlerts: [],
}

const movieContent: NotificationContent = {
  date: "2026-01-15",
  episodes: [],
  movies: [
    {
      title: "Dune: Part Two",
      releaseYear: 2024,
      posterUrl: "/dune2.jpg",
      offers: [{ providerName: "Max", providerIconUrl: null }],
    },
  ],
  streamingAlerts: [],
}

const contentWithStreamingAlerts: NotificationContent = {
  date: "2026-01-15",
  episodes: [],
  movies: [],
  streamingAlerts: [
    {
      titleId: "movie-123",
      title: "The Godfather",
      posterUrl: "/godfather.jpg",
      providerName: "Netflix",
      kind: "arrival",
    },
    {
      titleId: "movie-456",
      title: "Pulp Fiction",
      posterUrl: "/pulp.jpg",
      providerName: "Hulu",
      kind: "departure",
      leavingAt: "2026-02-01",
    },
  ],
}

const emptyContent: NotificationContent = {
  date: "2026-01-15",
  episodes: [],
  movies: [],
  streamingAlerts: [],
}

// ─── Provider configs ────────────────────────────────────────────────────────

const configs = {
  discord: { webhookUrl: "https://discord.com/api/webhooks/123456789/abcdef" },
  telegram: { botToken: "123:ABC", chatId: "-100123456" },
  gotify: { serverUrl: "https://gotify.example.com", appToken: "token123" },
  ntfy: { serverUrl: "https://ntfy.example.com", topic: "remindarr" },
  webhook: { url: "https://example.com/webhook" },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type FetchCapture = { url: string; body: unknown }

function mockFetch(): { calls: FetchCapture[]; spy: ReturnType<typeof spyOn> } {
  const calls: FetchCapture[] = []
  const spy = spyOn(globalThis, "fetch").mockImplementation((async (url: string | URL | Request, options?: RequestInit) => {
    let body: unknown = null
    try {
      body = options?.body ? JSON.parse(options.body as string) : null
    } catch {
      body = options?.body
    }
    calls.push({ url: String(url), body })
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }) as typeof fetch)
  return { calls, spy }
}

// ─── Invariant: empty content → no HTTP call ─────────────────────────────────

describe("all providers: empty content sends nothing", () => {
  const providers: Array<[string, NotificationProvider, Record<string, string>]> = [
    ["discord", new DiscordProvider(), configs.discord],
    ["telegram", new TelegramProvider(), configs.telegram],
    ["gotify", new GotifyProvider(), configs.gotify],
    ["ntfy", new NtfyProvider(), configs.ntfy],
    ["webhook", new WebhookProvider(), configs.webhook],
  ]

  for (const [name, provider, config] of providers) {
    it(`${name} sends no HTTP request when content is empty`, async () => {
      const { calls, spy } = mockFetch()
      try {
        await provider.send(config, emptyContent)
        expect(calls).toHaveLength(0)
      } finally {
        spy.mockRestore()
      }
    })
  }
})

// ─── Invariant: streamingAlerts guard ────────────────────────────────────────

describe("streaming alerts guard: length=0 produces no streaming-alert content", () => {
  it("discord: episode+movie content with streamingAlerts=[] has no streaming-alert embeds", async () => {
    const { calls, spy } = mockFetch()
    try {
      const provider = new DiscordProvider()
      await provider.send(configs.discord, episodeContent)
      expect(calls).toHaveLength(1)
      const body = calls[0].body as { embeds?: Array<{ title?: string }> }
      const embedTitles = (body.embeds ?? []).map((e) => e.title ?? "")
      // No streaming-alert embed titles (which have 🎬 prefix)
      expect(embedTitles.filter((t) => t.startsWith("🎬"))).toHaveLength(0)
    } finally {
      spy.mockRestore()
    }
  })

  it("discord: content with streamingAlerts has arrival/departure embeds", async () => {
    const { calls, spy } = mockFetch()
    try {
      const provider = new DiscordProvider()
      await provider.send(configs.discord, contentWithStreamingAlerts)
      expect(calls).toHaveLength(1)
      const body = calls[0].body as { embeds?: Array<{ title?: string }> }
      const embedTitles = (body.embeds ?? []).map((e) => e.title ?? "")
      expect(embedTitles.filter((t) => t.startsWith("🎬"))).toHaveLength(2)
    } finally {
      spy.mockRestore()
    }
  })
})

// ─── Invariant: validateConfig rejects bad config ────────────────────────────

describe("validateConfig: all providers reject missing required fields", () => {
  it("discord rejects empty config", () => {
    expect(new DiscordProvider().validateConfig({}).valid).toBe(false)
  })
  it("telegram rejects empty config", () => {
    expect(new TelegramProvider().validateConfig({}).valid).toBe(false)
  })
  it("gotify rejects empty config", () => {
    expect(new GotifyProvider().validateConfig({}).valid).toBe(false)
  })
  it("ntfy rejects empty config", () => {
    expect(new NtfyProvider().validateConfig({}).valid).toBe(false)
  })
  it("webhook rejects empty config", () => {
    expect(new WebhookProvider().validateConfig({}).valid).toBe(false)
  })
})

// ─── Invariant: movie notification reaches all providers ─────────────────────

describe("movie content: all providers send exactly one HTTP call", () => {
  const providers: Array<[string, NotificationProvider, Record<string, string>]> = [
    ["discord", new DiscordProvider(), configs.discord],
    ["telegram", new TelegramProvider(), configs.telegram],
    ["gotify", new GotifyProvider(), configs.gotify],
    ["ntfy", new NtfyProvider(), configs.ntfy],
    ["webhook", new WebhookProvider(), configs.webhook],
  ]

  for (const [name, provider, config] of providers) {
    it(`${name} sends one request for movie content`, async () => {
      const { calls, spy } = mockFetch()
      try {
        await provider.send(config, movieContent)
        expect(calls).toHaveLength(1)
      } finally {
        spy.mockRestore()
      }
    })
  }
})
