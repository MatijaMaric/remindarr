import { describe, it, expect } from "bun:test";
import {
  escapeOg,
  buildOgTags,
  wrappedOgDescription,
  wrappedOgImage,
} from "./og-tags";
import type { YearInReview } from "../db/repository/year-in-review";

function emptyReview(overrides: Partial<YearInReview> = {}): YearInReview {
  return {
    year: 2025,
    movies_watched: 0,
    episodes_watched: 0,
    watch_time_minutes: 0,
    watch_time_minutes_movies: 0,
    watch_time_minutes_shows: 0,
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
