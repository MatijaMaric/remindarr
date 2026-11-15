import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import {
  escapeOg,
  buildOgTags,
  wrappedOgDescription,
  wrappedOgImage,
  wrappedShareOgTags,
} from "./og-tags";
import type { YearInReview } from "../db/repository/year-in-review";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser, setWatchlistShareToken } from "../db/repository";
import { setWrappedShareToken } from "../db/repository/wrapped-shares";
import { initCache } from "../cache";
import { MemoryCache } from "../cache/memory";

function emptyReview(overrides: Partial<YearInReview> = {}): YearInReview {
  return {
    year: 2025,
    movies_watched: 0,
    episodes_watched: 0,
    watch_time_minutes: 0,
    watch_time_unknown_episodes: 0,
    top_genres: [],
    top_providers: [],
    top_shows: [],
    longest_binge: null,
    most_rewatched: null,
    first_watch: null,
    last_watch: null,
    years: [],
    ...overrides,
  };
}

describe("escapeOg", () => {
  it("escapes HTML special characters", () => {
    expect(escapeOg(`<b>"x" & y</b>`)).toBe(
      "&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;",
    );
  });
});

describe("buildOgTags", () => {
  it("escapes markup-bearing names, descriptions and poster URLs", () => {
    const payload = '\"><script>window.injected = true</script><meta content="';
    const html = buildOgTags({
      title: `${payload}'s Watchlist — Remindarr`,
      description: `1 title tracked by @${payload}`,
      image: `https://image.tmdb.org/t/p/w342/${payload}`,
    });
    expect(html).not.toContain("<script>");
    expect(html.match(/&lt;script&gt;/g)).toHaveLength(6);
  });

  it("includes title and description without an image", () => {
    const html = buildOgTags({
      title: "Ada's 2025 Wrapped",
      description: "12h watched",
    });
    expect(html).toContain('og:title" content="Ada\'s 2025 Wrapped"');
    expect(html).toContain('og:description" content="12h watched"');
    expect(html).toContain('twitter:card" content="summary"');
    expect(html).not.toContain("og:image");
  });

  it("includes image tags when a poster is provided", () => {
    const html = buildOgTags({
      title: "Wrapped",
      description: "stats",
      image: "https://image.tmdb.org/t/p/w342/x.jpg",
    });
    expect(html).toContain(
      'og:image" content="https://image.tmdb.org/t/p/w342/x.jpg"',
    );
    expect(html).toContain('twitter:card" content="summary_large_image"');
  });
});

describe("wrappedOgDescription", () => {
  it("summarizes hours, movies, episodes, and top show", () => {
    const text = wrappedOgDescription(
      emptyReview({
        movies_watched: 2,
        episodes_watched: 1,
        watch_time_minutes: 150,
        top_shows: [
          {
            title_id: "s1",
            title: "The Bear",
            poster_url: "/p.jpg",
            count: 8,
          },
        ],
      }),
    );
    expect(text).toBe("3h watched · 2 movies · 1 episode · Top show: The Bear");
  });
});

describe("wrappedOgImage", () => {
  it("prefixes relative poster paths", () => {
    expect(
      wrappedOgImage(
        emptyReview({
          top_shows: [
            { title_id: "s1", title: "X", poster_url: "/p.jpg", count: 1 },
          ],
        }),
      ),
    ).toBe("https://image.tmdb.org/t/p/w342/p.jpg");
  });

  it("returns null when there is no poster", () => {
    expect(wrappedOgImage(emptyReview())).toBeNull();
  });
});

describe("wrappedShareOgTags", () => {
  const wrappedToken = "a".repeat(32);
  const watchlistToken = "b".repeat(32);

  beforeEach(async () => {
    setupTestDb();
    initCache(new MemoryCache(100, 60_000));
    const userId = await createUser("ogowner", "hash");
    await setWrappedShareToken(userId, 2025, wrappedToken);
    await setWatchlistShareToken(userId, watchlistToken);
  });

  afterAll(() => {
    teardownTestDb();
  });

  it("builds tags for a Year in Review token of that year", async () => {
    const html = await wrappedShareOgTags(wrappedToken, 2025);
    expect(html).toContain("ogowner's 2025 Wrapped — Remindarr");
  });

  // Regression: the preview handlers looked the token up as a watchlist token,
  // so wrapped links got no preview and watchlist tokens leaked yearly stats.
  it("returns no tags for a watchlist share token", async () => {
    expect(await wrappedShareOgTags(watchlistToken, 2025)).toBe("");
  });

  it("returns no tags for another year or a malformed token", async () => {
    expect(await wrappedShareOgTags(wrappedToken, 2024)).toBe("");
    expect(await wrappedShareOgTags("nope", 2025)).toBe("");
  });
});
