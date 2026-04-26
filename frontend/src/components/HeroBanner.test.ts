import { describe, it, expect } from "bun:test";
import { getHeroBannerSlides, getHeroImageUrl } from "./HeroBanner";
import type { Episode } from "../types";

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: 1,
    title_id: "tv-100",
    season_number: 1,
    episode_number: 1,
    name: "Pilot",
    overview: "First episode",
    air_date: "2024-01-01",
    still_path: null,
    show_title: "Test Show",
    poster_url: null,
    is_watched: false,
    ...overrides,
  };
}

describe("getHeroBannerSlides", () => {
  it("returns empty array for empty input", () => {
    expect(getHeroBannerSlides([])).toEqual([]);
  });

  it("groups episodes by show and picks first per show", () => {
    const episodes = [
      makeEpisode({ id: 1, title_id: "tv-1", episode_number: 1, show_title: "Show A" }),
      makeEpisode({ id: 2, title_id: "tv-1", episode_number: 2, show_title: "Show A" }),
      makeEpisode({ id: 3, title_id: "tv-2", episode_number: 1, show_title: "Show B" }),
    ];

    const slides = getHeroBannerSlides(episodes);
    expect(slides).toHaveLength(2);
    expect(slides[0].featured.title_id).toBe("tv-1");
    expect(slides[0].featured.episode_number).toBe(1);
    expect(slides[0].remainingCount).toBe(2);
    expect(slides[1].featured.title_id).toBe("tv-2");
    expect(slides[1].remainingCount).toBe(1);
  });

  it("sorts episodes within a show so lowest season/episode is featured", () => {
    const episodes = [
      makeEpisode({ id: 2, title_id: "tv-1", season_number: 1, episode_number: 3, show_title: "Show A" }),
      makeEpisode({ id: 1, title_id: "tv-1", season_number: 1, episode_number: 1, show_title: "Show A" }),
      makeEpisode({ id: 3, title_id: "tv-1", season_number: 1, episode_number: 2, show_title: "Show A" }),
    ];
    const slides = getHeroBannerSlides(episodes);
    expect(slides[0].featured.episode_number).toBe(1);
  });

  it("sorts across seasons: earlier season beats higher episode number of later season", () => {
    const episodes = [
      makeEpisode({ id: 1, title_id: "tv-1", season_number: 2, episode_number: 1, show_title: "Show A" }),
      makeEpisode({ id: 2, title_id: "tv-1", season_number: 1, episode_number: 5, show_title: "Show A" }),
    ];
    const slides = getHeroBannerSlides(episodes);
    expect(slides[0].featured.season_number).toBe(1);
    expect(slides[0].featured.episode_number).toBe(5);
  });

  it("limits to 6 slides max", () => {
    const episodes = Array.from({ length: 10 }, (_, i) =>
      makeEpisode({ id: i, title_id: `tv-${i}`, show_title: `Show ${i}` })
    );

    const slides = getHeroBannerSlides(episodes);
    expect(slides).toHaveLength(6);
  });

  it("builds sidebar excluding current show", () => {
    const episodes = [
      makeEpisode({ id: 1, title_id: "tv-1", show_title: "Show A" }),
      makeEpisode({ id: 2, title_id: "tv-2", show_title: "Show B" }),
      makeEpisode({ id: 3, title_id: "tv-3", show_title: "Show C" }),
    ];

    const slides = getHeroBannerSlides(episodes);
    expect(slides[0].sidebar).toHaveLength(2);
    expect(slides[0].sidebar.map((s) => s.showTitle)).toEqual(["Show B", "Show C"]);
    expect(slides[1].sidebar).toHaveLength(2);
    expect(slides[1].sidebar.map((s) => s.showTitle)).toEqual(["Show A", "Show C"]);
  });

  it("handles single show", () => {
    const episodes = [
      makeEpisode({ id: 1, title_id: "tv-1", show_title: "Solo Show" }),
    ];

    const slides = getHeroBannerSlides(episodes);
    expect(slides).toHaveLength(1);
    expect(slides[0].sidebar).toHaveLength(0);
  });

  it("includes posterUrl in sidebar items", () => {
    const episodes = [
      makeEpisode({ id: 1, title_id: "tv-1", show_title: "Show A", poster_url: "https://img/a.jpg" }),
      makeEpisode({ id: 2, title_id: "tv-2", show_title: "Show B", poster_url: "https://img/b.jpg" }),
    ];

    const slides = getHeroBannerSlides(episodes);
    expect(slides[0].sidebar[0].posterUrl).toBe("https://img/b.jpg");
    expect(slides[1].sidebar[0].posterUrl).toBe("https://img/a.jpg");
  });

  it("sets posterUrl to null when poster_url is missing", () => {
    const episodes = [
      makeEpisode({ id: 1, title_id: "tv-1", show_title: "Show A" }),
      makeEpisode({ id: 2, title_id: "tv-2", show_title: "Show B" }),
    ];

    const slides = getHeroBannerSlides(episodes);
    expect(slides[0].sidebar[0].posterUrl).toBeNull();
  });
});

describe("getHeroImageUrl", () => {
  it("prefers backdrop_url", () => {
    const ep = makeEpisode({
      backdrop_url: "https://example.com/backdrop.jpg",
      still_path: "/still.jpg",
      poster_url: "https://example.com/poster.jpg",
    });
    expect(getHeroImageUrl(ep)).toBe("https://example.com/backdrop.jpg");
  });

  it("falls back to still_path when no backdrop_url", () => {
    const ep = makeEpisode({
      backdrop_url: null,
      still_path: "/still.jpg",
      poster_url: "https://example.com/poster.jpg",
    });
    expect(getHeroImageUrl(ep)).toBe("https://image.tmdb.org/t/p/w1280/still.jpg");
  });

  it("falls back to poster_url when no backdrop or still", () => {
    const ep = makeEpisode({
      backdrop_url: null,
      still_path: null,
      poster_url: "https://example.com/poster.jpg",
    });
    expect(getHeroImageUrl(ep)).toBe("https://example.com/poster.jpg");
  });

  it("returns null when no images available", () => {
    const ep = makeEpisode({
      backdrop_url: null,
      still_path: null,
      poster_url: null,
    });
    expect(getHeroImageUrl(ep)).toBeNull();
  });

  it("treats undefined backdrop_url as missing", () => {
    const ep = makeEpisode({
      still_path: "/still.jpg",
      poster_url: "https://example.com/poster.jpg",
    });
    delete (ep as any).backdrop_url;
    expect(getHeroImageUrl(ep)).toBe("https://image.tmdb.org/t/p/w1280/still.jpg");
  });
});
