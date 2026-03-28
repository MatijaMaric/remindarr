import { describe, it, expect } from "bun:test";
import { groupShowsByStatus } from "./groupShows";
import type { Title } from "../types";

function makeShow(overrides: Partial<Title> = {}): Title {
  return {
    id: "show-1",
    object_type: "SHOW",
    title: "Test Show",
    original_title: null,
    release_year: 2024,
    release_date: "2024-01-01",
    runtime_minutes: null,
    short_description: null,
    genres: [],
    imdb_id: null,
    tmdb_id: null,
    poster_url: null,
    age_certification: null,
    original_language: null,
    tmdb_url: null,
    imdb_score: null,
    imdb_votes: null,
    tmdb_score: null,
    is_tracked: true,
    offers: [],
    ...overrides,
  };
}

describe("groupShowsByStatus", () => {
  it("returns empty array for no shows", () => {
    expect(groupShowsByStatus([])).toEqual([]);
  });

  it("groups shows by status in correct order", () => {
    const shows = [
      makeShow({ id: "s1", show_status: "completed" }),
      makeShow({ id: "s2", show_status: "watching" }),
      makeShow({ id: "s3", show_status: "caught_up" }),
      makeShow({ id: "s4", show_status: "not_started" }),
      makeShow({ id: "s5", show_status: "unreleased" }),
    ];

    const groups = groupShowsByStatus(shows);
    expect(groups).toHaveLength(5);
    expect(groups[0].key).toBe("watching");
    expect(groups[1].key).toBe("caught_up");
    expect(groups[2].key).toBe("not_started");
    expect(groups[3].key).toBe("unreleased");
    expect(groups[4].key).toBe("completed");
  });

  it("omits empty groups", () => {
    const shows = [
      makeShow({ id: "s1", show_status: "watching" }),
      makeShow({ id: "s2", show_status: "completed" }),
    ];

    const groups = groupShowsByStatus(shows);
    expect(groups).toHaveLength(2);
    expect(groups[0].key).toBe("watching");
    expect(groups[1].key).toBe("completed");
  });

  it("treats null status as not_started", () => {
    const shows = [makeShow({ id: "s1", show_status: null })];
    const groups = groupShowsByStatus(shows);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("not_started");
    expect(groups[0].titles[0].id).toBe("s1");
  });

  it("treats undefined status as not_started", () => {
    const shows = [makeShow({ id: "s1" })];
    const groups = groupShowsByStatus(shows);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("not_started");
  });

  it("sorts watching by latest_released_air_date DESC", () => {
    const shows = [
      makeShow({ id: "s1", show_status: "watching", latest_released_air_date: "2024-01-01" }),
      makeShow({ id: "s2", show_status: "watching", latest_released_air_date: "2024-06-15" }),
      makeShow({ id: "s3", show_status: "watching", latest_released_air_date: "2024-03-10" }),
    ];

    const groups = groupShowsByStatus(shows);
    expect(groups[0].titles.map((t) => t.id)).toEqual(["s2", "s3", "s1"]);
  });

  it("sorts caught_up by next_episode_air_date ASC", () => {
    const shows = [
      makeShow({ id: "s1", show_status: "caught_up", next_episode_air_date: "2025-03-01" }),
      makeShow({ id: "s2", show_status: "caught_up", next_episode_air_date: "2025-01-15" }),
      makeShow({ id: "s3", show_status: "caught_up", next_episode_air_date: "2025-06-01" }),
    ];

    const groups = groupShowsByStatus(shows);
    expect(groups[0].titles.map((t) => t.id)).toEqual(["s2", "s1", "s3"]);
  });

  it("sorts not_started by latest_released_air_date DESC", () => {
    const shows = [
      makeShow({ id: "s1", show_status: "not_started", latest_released_air_date: "2024-01-01" }),
      makeShow({ id: "s2", show_status: "not_started", latest_released_air_date: "2024-12-01" }),
    ];

    const groups = groupShowsByStatus(shows);
    expect(groups[0].titles.map((t) => t.id)).toEqual(["s2", "s1"]);
  });

  it("sorts unreleased by release_date ASC", () => {
    const shows = [
      makeShow({ id: "s1", show_status: "unreleased", release_date: "2025-12-01" }),
      makeShow({ id: "s2", show_status: "unreleased", release_date: "2025-06-01" }),
    ];

    const groups = groupShowsByStatus(shows);
    expect(groups[0].titles.map((t) => t.id)).toEqual(["s2", "s1"]);
  });

  it("sorts completed by tracked_at DESC", () => {
    const shows = [
      makeShow({ id: "s1", show_status: "completed", tracked_at: "2024-01-01T00:00:00Z" }),
      makeShow({ id: "s2", show_status: "completed", tracked_at: "2024-06-01T00:00:00Z" }),
    ];

    const groups = groupShowsByStatus(shows);
    expect(groups[0].titles.map((t) => t.id)).toEqual(["s2", "s1"]);
  });

  it("pushes null dates to the end in date-sorted groups", () => {
    const shows = [
      makeShow({ id: "s1", show_status: "watching", latest_released_air_date: null }),
      makeShow({ id: "s2", show_status: "watching", latest_released_air_date: "2024-06-15" }),
    ];

    const groups = groupShowsByStatus(shows);
    expect(groups[0].titles.map((t) => t.id)).toEqual(["s2", "s1"]);
  });

  it("includes correct labelKey for each group", () => {
    const shows = [
      makeShow({ id: "s1", show_status: "watching" }),
      makeShow({ id: "s2", show_status: "caught_up" }),
    ];

    const groups = groupShowsByStatus(shows);
    expect(groups[0].labelKey).toBe("tracked.sections.watching");
    expect(groups[1].labelKey).toBe("tracked.sections.caughtUp");
  });
});
