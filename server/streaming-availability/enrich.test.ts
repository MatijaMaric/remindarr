import { describe, it, expect, beforeEach, afterAll, spyOn } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { getRawDb } from "../db/bun-db";
import { CONFIG } from "../config";

// Mock Sentry
import Sentry from "../sentry";
spyOn(Sentry, "startSpan").mockImplementation((_opts: any, fn: any) => fn({}));

// Mock SA client
import * as saClient from "./client";
const mockFetchStreamingOptions = spyOn(saClient, "fetchStreamingOptions");

import { enrichTitleDeepLinks } from "./enrich";

const originalCountry = CONFIG.COUNTRY;

function insertTitle(id: string, objectType: string, tmdbId: string) {
  const db = getRawDb();
  db.prepare(
    `INSERT INTO titles (id, object_type, tmdb_id, title, release_date) VALUES (?, ?, ?, ?, '2024-01-01')`,
  ).run(id, objectType, tmdbId, `Title ${id}`);
}

function insertProvider(id: number, name: string, technicalName: string) {
  const db = getRawDb();
  db.prepare(
    `INSERT OR IGNORE INTO providers (id, name, technical_name) VALUES (?, ?, ?)`,
  ).run(id, name, technicalName);
}

function insertOffer(titleId: string, providerId: number, monetizationType: string, url: string) {
  const db = getRawDb();
  db.prepare(
    `INSERT INTO offers (title_id, provider_id, monetization_type, url) VALUES (?, ?, ?, ?)`,
  ).run(titleId, providerId, monetizationType, url);
}

function getOfferDeepLink(titleId: string, providerId: number): string | null {
  const db = getRawDb();
  const row = db
    .prepare("SELECT deep_link FROM offers WHERE title_id = ? AND provider_id = ?")
    .get(titleId, providerId) as { deep_link: string | null } | null;
  return row?.deep_link ?? null;
}

function getOffers(titleId: string) {
  const db = getRawDb();
  return db
    .prepare("SELECT title_id, provider_id, monetization_type, url, deep_link, presentation_type, price_value, price_currency, available_to FROM offers WHERE title_id = ?")
    .all(titleId) as { title_id: string; provider_id: number; monetization_type: string; url: string; deep_link: string | null; presentation_type: string | null; price_value: number | null; price_currency: string | null; available_to: string | null }[];
}

function getProvider(id: number) {
  const db = getRawDb();
  return db
    .prepare("SELECT id, name, technical_name, icon_url FROM providers WHERE id = ?")
    .get(id) as { id: number; name: string; technical_name: string; icon_url: string | null } | null;
}

function getSaFetchedAt(titleId: string): string | null {
  const db = getRawDb();
  const row = db
    .prepare("SELECT sa_fetched_at FROM titles WHERE id = ?")
    .get(titleId) as { sa_fetched_at: string | null } | null;
  return row?.sa_fetched_at ?? null;
}

beforeEach(() => {
  setupTestDb();
  mockFetchStreamingOptions.mockClear();
  CONFIG.COUNTRY = "US";
});

afterAll(() => {
  CONFIG.COUNTRY = originalCountry;
  mockFetchStreamingOptions.mockRestore();
  teardownTestDb();
});

describe("enrichTitleDeepLinks", () => {
  it("updates deep_link for matching offers", async () => {
    insertTitle("movie-550", "MOVIE", "550");
    insertProvider(8, "Netflix", "netflix");
    insertOffer("movie-550", 8, "FLATRATE", "https://www.themoviedb.org/movie/550");

    mockFetchStreamingOptions.mockResolvedValue([
      {
        service: { id: "netflix", name: "Netflix", homePage: "", themeColorCode: "", imageSet: {} },
        type: "subscription",
        link: "https://www.netflix.com/watch/12345",
      },
    ] as any);

    const count = await enrichTitleDeepLinks("movie-550", 550, "MOVIE");

    expect(count).toBe(1);
    expect(getOfferDeepLink("movie-550", 8)).toBe("https://www.netflix.com/watch/12345");
  });

  it("marks sa_fetched_at even when no offers match", async () => {
    insertTitle("movie-100", "MOVIE", "100");

    mockFetchStreamingOptions.mockResolvedValue([]);

    const count = await enrichTitleDeepLinks("movie-100", 100, "MOVIE");

    expect(count).toBe(0);
    expect(getSaFetchedAt("movie-100")).not.toBeNull();
  });

  it("creates new offers from SA when title has no existing offers", async () => {
    insertTitle("movie-200", "MOVIE", "200");

    mockFetchStreamingOptions.mockResolvedValue([
      {
        service: { id: "netflix", name: "Netflix", homePage: "", themeColorCode: "", imageSet: { whiteImage: "https://img.sa/netflix.png", lightThemeImage: "", darkThemeImage: "" } },
        type: "subscription",
        link: "https://www.netflix.com/watch/999",
        quality: "hd",
      },
    ] as any);

    const count = await enrichTitleDeepLinks("movie-200", 200, "MOVIE");

    expect(count).toBe(1);
    expect(getSaFetchedAt("movie-200")).not.toBeNull();

    const created = getOffers("movie-200");
    expect(created).toHaveLength(1);
    expect(created[0].provider_id).toBe(8);
    expect(created[0].monetization_type).toBe("FLATRATE");
    expect(created[0].url).toBe("https://www.netflix.com/watch/999");
    expect(created[0].deep_link).toBe("https://www.netflix.com/watch/999");
    expect(created[0].presentation_type).toBe("hd");

    const provider = getProvider(8);
    expect(provider).not.toBeNull();
    expect(provider!.name).toBe("Netflix");
  });

  it("matches by provider only when monetization type differs", async () => {
    insertTitle("movie-300", "MOVIE", "300");
    insertProvider(8, "Netflix", "netflix");
    insertOffer("movie-300", 8, "FLATRATE", "https://tmdb.org/movie/300");

    mockFetchStreamingOptions.mockResolvedValue([
      {
        service: { id: "netflix", name: "Netflix", homePage: "", themeColorCode: "", imageSet: {} },
        type: "addon",
        link: "https://www.netflix.com/watch/addon/300",
      },
    ] as any);

    const count = await enrichTitleDeepLinks("movie-300", 300, "MOVIE");

    expect(count).toBe(1);
    expect(getOfferDeepLink("movie-300", 8)).toBe("https://www.netflix.com/watch/addon/300");
  });

  it("handles multiple providers", async () => {
    insertTitle("movie-400", "MOVIE", "400");
    insertProvider(8, "Netflix", "netflix");
    insertProvider(337, "Disney Plus", "disney_plus");
    insertOffer("movie-400", 8, "FLATRATE", "https://tmdb.org/movie/400");
    insertOffer("movie-400", 337, "FLATRATE", "https://tmdb.org/movie/400");

    mockFetchStreamingOptions.mockResolvedValue([
      {
        service: { id: "netflix", name: "Netflix", homePage: "", themeColorCode: "", imageSet: {} },
        type: "subscription",
        link: "https://www.netflix.com/watch/400",
      },
      {
        service: { id: "disney", name: "Disney+", homePage: "", themeColorCode: "", imageSet: {} },
        type: "subscription",
        link: "https://www.disneyplus.com/movies/400",
      },
    ] as any);

    const count = await enrichTitleDeepLinks("movie-400", 400, "MOVIE");

    expect(count).toBe(2);
    expect(getOfferDeepLink("movie-400", 8)).toBe("https://www.netflix.com/watch/400");
    expect(getOfferDeepLink("movie-400", 337)).toBe("https://www.disneyplus.com/movies/400");
  });

  it("skips unmapped providers gracefully", async () => {
    insertTitle("movie-500", "MOVIE", "500");
    insertProvider(8, "Netflix", "netflix");
    insertOffer("movie-500", 8, "FLATRATE", "https://tmdb.org/movie/500");

    mockFetchStreamingOptions.mockResolvedValue([
      {
        service: { id: "unknown_service_xyz", name: "Unknown Service", homePage: "", themeColorCode: "", imageSet: {} },
        type: "subscription",
        link: "https://unknown.com/watch/500",
      },
    ] as any);

    const count = await enrichTitleDeepLinks("movie-500", 500, "MOVIE");

    expect(count).toBe(0);
    expect(getSaFetchedAt("movie-500")).not.toBeNull();
  });

  it("falls back to technical_name matching for unmapped providers", async () => {
    insertTitle("movie-600", "MOVIE", "600");
    insertProvider(999, "Custom Service", "custom_service");
    insertOffer("movie-600", 999, "FLATRATE", "https://tmdb.org/movie/600");

    mockFetchStreamingOptions.mockResolvedValue([
      {
        service: { id: "custom_service", name: "Custom Service", homePage: "", themeColorCode: "", imageSet: {} },
        type: "subscription",
        link: "https://custom-service.com/watch/600",
      },
    ] as any);

    const count = await enrichTitleDeepLinks("movie-600", 600, "MOVIE");

    expect(count).toBe(1);
    expect(getOfferDeepLink("movie-600", 999)).toBe("https://custom-service.com/watch/600");
  });

  it("creates offers for new providers alongside enriching existing ones", async () => {
    insertTitle("tv-63926", "SHOW", "63926");
    insertProvider(8, "Netflix", "netflix");
    insertOffer("tv-63926", 8, "FLATRATE", "https://tmdb.org/tv/63926");

    mockFetchStreamingOptions.mockResolvedValue([
      {
        service: { id: "netflix", name: "Netflix", homePage: "", themeColorCode: "", imageSet: { whiteImage: "", lightThemeImage: "", darkThemeImage: "" } },
        type: "subscription",
        link: "https://www.netflix.com/watch/63926",
      },
      {
        service: { id: "crunchyroll", name: "Crunchyroll", homePage: "", themeColorCode: "", imageSet: { whiteImage: "https://img.sa/crunchyroll.png", lightThemeImage: "", darkThemeImage: "" } },
        type: "subscription",
        link: "https://www.crunchyroll.com/watch/63926",
      },
    ] as any);

    const count = await enrichTitleDeepLinks("tv-63926", 63926, "SHOW");

    expect(count).toBe(2);
    // Netflix: existing offer enriched with deep link
    expect(getOfferDeepLink("tv-63926", 8)).toBe("https://www.netflix.com/watch/63926");
    // Crunchyroll: new offer created
    const allOffers = getOffers("tv-63926");
    expect(allOffers).toHaveLength(2);
    const crunchyOffer = allOffers.find(o => o.provider_id === 283);
    expect(crunchyOffer).toBeDefined();
    expect(crunchyOffer!.url).toBe("https://www.crunchyroll.com/watch/63926");
    expect(crunchyOffer!.deep_link).toBe("https://www.crunchyroll.com/watch/63926");
    expect(crunchyOffer!.monetization_type).toBe("FLATRATE");

    const provider = getProvider(283);
    expect(provider).not.toBeNull();
    expect(provider!.name).toBe("Crunchyroll");
    expect(provider!.icon_url).toBe("https://img.sa/crunchyroll.png");
  });

  it("creates offers with price and expiry from SA data", async () => {
    insertTitle("movie-700", "MOVIE", "700");

    mockFetchStreamingOptions.mockResolvedValue([
      {
        service: { id: "apple", name: "Apple TV", homePage: "", themeColorCode: "", imageSet: { whiteImage: "", lightThemeImage: "", darkThemeImage: "" } },
        type: "rent",
        link: "https://tv.apple.com/movie/700",
        quality: "uhd",
        price: { amount: "3.99", currency: "USD", formatted: "$3.99" },
        expiresOn: 1735689600, // 2025-01-01T00:00:00Z
      },
    ] as any);

    const count = await enrichTitleDeepLinks("movie-700", 700, "MOVIE");

    expect(count).toBe(1);
    const created = getOffers("movie-700");
    expect(created).toHaveLength(1);
    expect(created[0].provider_id).toBe(350);
    expect(created[0].monetization_type).toBe("RENT");
    expect(created[0].presentation_type).toBe("uhd");
    expect(created[0].price_value).toBe(3.99);
    expect(created[0].price_currency).toBe("USD");
    expect(created[0].available_to).toBe("2025-01-01T00:00:00.000Z");
  });

  it("does not create duplicate provider rows", async () => {
    insertTitle("movie-800", "MOVIE", "800");
    insertProvider(8, "Netflix", "netflix");

    mockFetchStreamingOptions.mockResolvedValue([
      {
        service: { id: "netflix", name: "Netflix Updated", homePage: "", themeColorCode: "", imageSet: { whiteImage: "https://new-icon.png", lightThemeImage: "", darkThemeImage: "" } },
        type: "subscription",
        link: "https://www.netflix.com/watch/800",
      },
    ] as any);

    const count = await enrichTitleDeepLinks("movie-800", 800, "MOVIE");

    expect(count).toBe(1);
    // Provider should keep original name (onConflictDoNothing)
    const provider = getProvider(8);
    expect(provider!.name).toBe("Netflix");
  });
});
