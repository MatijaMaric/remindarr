import { describe, it, expect } from "bun:test";
import {
  formatEpisodeCode,
  getUniqueProviders,
  groupByShow,
  formatUpcomingDate,
  isEpisodeReleased,
} from "./EpisodeComponents";
import type { Episode, Offer } from "../types";

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: 1,
    title_id: "show-1",
    season_number: 1,
    episode_number: 1,
    name: "Pilot",
    overview: null,
    air_date: "2026-03-15",
    still_path: null,
    show_title: "Test Show",
    poster_url: null,
    ...overrides,
  };
}

function makeOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: 1,
    title_id: "show-1",
    provider_id: 100,
    monetization_type: "FLATRATE",
    presentation_type: "HD",
    price_value: null,
    price_currency: null,
    url: "https://example.com",
    available_to: null,
    provider_name: "Netflix",
    provider_technical_name: "netflix",
    provider_icon_url: "https://example.com/icon.png",
    ...overrides,
  };
}

describe("formatEpisodeCode", () => {
  it("formats single digit season and episode with padding", () => {
    const ep = makeEpisode({ season_number: 1, episode_number: 3 });
    expect(formatEpisodeCode(ep)).toBe("S01E03");
  });

  it("formats double digit season and episode", () => {
    const ep = makeEpisode({ season_number: 12, episode_number: 24 });
    expect(formatEpisodeCode(ep)).toBe("S12E24");
  });
});

describe("getUniqueProviders", () => {
  it("returns empty array for undefined offers", () => {
    expect(getUniqueProviders(undefined)).toEqual([]);
  });

  it("returns empty array for empty offers", () => {
    expect(getUniqueProviders([])).toEqual([]);
  });

  it("deduplicates by provider_id", () => {
    const offers = [
      makeOffer({ provider_id: 1, monetization_type: "FLATRATE" }),
      makeOffer({ provider_id: 1, monetization_type: "ADS" }),
      makeOffer({ provider_id: 2, monetization_type: "FREE" }),
    ];
    const result = getUniqueProviders(offers);
    expect(result.length).toBe(2);
  });

  it("filters out non-streaming monetization types", () => {
    const offers = [
      makeOffer({ provider_id: 1, monetization_type: "BUY" }),
      makeOffer({ provider_id: 2, monetization_type: "RENT" }),
    ];
    expect(getUniqueProviders(offers)).toEqual([]);
  });
});

describe("groupByShow", () => {
  it("groups episodes by title_id", () => {
    const episodes = [
      makeEpisode({ id: 1, title_id: "show-1" }),
      makeEpisode({ id: 2, title_id: "show-1" }),
      makeEpisode({ id: 3, title_id: "show-2" }),
    ];
    const result = groupByShow(episodes);
    expect(result.size).toBe(2);
    expect(result.get("show-1")!.length).toBe(2);
    expect(result.get("show-2")!.length).toBe(1);
  });

  it("returns empty map for empty input", () => {
    expect(groupByShow([]).size).toBe(0);
  });
});

describe("formatUpcomingDate", () => {
  it("returns 'Tomorrow' for tomorrow's date", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);
    expect(formatUpcomingDate(dateStr)).toBe("Tomorrow");
  });

  it("returns formatted date for other dates", () => {
    // A date far in the future won't be "Tomorrow"
    const result = formatUpcomingDate("2030-06-15");
    expect(typeof result).toBe("string");
    expect(result).not.toBe("Tomorrow");
  });
});

describe("isEpisodeReleased", () => {
  it("returns false for null air_date", () => {
    const ep = makeEpisode({ air_date: null });
    expect(isEpisodeReleased(ep)).toBe(false);
  });

  it("returns true for past air_date", () => {
    const ep = makeEpisode({ air_date: "2020-01-01" });
    expect(isEpisodeReleased(ep)).toBe(true);
  });

  it("returns true for today's air_date", () => {
    const today = new Date().toISOString().slice(0, 10);
    const ep = makeEpisode({ air_date: today });
    expect(isEpisodeReleased(ep)).toBe(true);
  });

  it("returns false for future air_date", () => {
    const ep = makeEpisode({ air_date: "2099-12-31" });
    expect(isEpisodeReleased(ep)).toBe(false);
  });
});
