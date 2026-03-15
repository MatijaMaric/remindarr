import { describe, it, expect } from "bun:test";
import { getBackgroundImageUrl } from "./ReelsCard";
import type { Episode } from "../types";

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

describe("getBackgroundImageUrl", () => {
  it("returns TMDB still URL when still_path is present", () => {
    const ep = makeEpisode({ still_path: "/abc123.jpg" });
    expect(getBackgroundImageUrl(ep)).toBe("https://image.tmdb.org/t/p/w1280/abc123.jpg");
  });

  it("returns poster_url when still_path is null", () => {
    const ep = makeEpisode({ poster_url: "https://example.com/poster.jpg" });
    expect(getBackgroundImageUrl(ep)).toBe("https://example.com/poster.jpg");
  });

  it("returns null when both still_path and poster_url are null", () => {
    const ep = makeEpisode();
    expect(getBackgroundImageUrl(ep)).toBeNull();
  });

  it("prefers still_path over poster_url", () => {
    const ep = makeEpisode({ still_path: "/still.jpg", poster_url: "https://example.com/poster.jpg" });
    expect(getBackgroundImageUrl(ep)).toBe("https://image.tmdb.org/t/p/w1280/still.jpg");
  });
});
