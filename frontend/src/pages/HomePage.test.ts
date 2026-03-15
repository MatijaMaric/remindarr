import { describe, it, expect } from "bun:test";
import { groupByShowAndSeason, EPISODES_PER_PAGE } from "./HomePage";
import type { Episode } from "../types";

function makeEpisode(overrides: Partial<Episode> & { id: number; title_id: string; season_number: number; episode_number: number }): Episode {
  return {
    name: `Episode ${overrides.episode_number}`,
    overview: null,
    air_date: "2025-01-01",
    still_path: null,
    show_title: "Test Show",
    poster_url: null,
    ...overrides,
  };
}

describe("groupByShowAndSeason", () => {
  it("groups episodes by show and season", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 1, title_id: "show-1", season_number: 1, episode_number: 1 }),
      makeEpisode({ id: 2, title_id: "show-1", season_number: 1, episode_number: 2 }),
      makeEpisode({ id: 3, title_id: "show-1", season_number: 2, episode_number: 1 }),
      makeEpisode({ id: 4, title_id: "show-2", season_number: 1, episode_number: 1 }),
    ];

    const result = groupByShowAndSeason(episodes);

    expect(result.size).toBe(2);
    expect(result.get("show-1")!.size).toBe(2);
    expect(result.get("show-1")!.get(1)!.length).toBe(2);
    expect(result.get("show-1")!.get(2)!.length).toBe(1);
    expect(result.get("show-2")!.size).toBe(1);
    expect(result.get("show-2")!.get(1)!.length).toBe(1);
  });

  it("returns empty map for empty input", () => {
    const result = groupByShowAndSeason([]);
    expect(result.size).toBe(0);
  });

  it("handles single episode", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 1, title_id: "show-1", season_number: 3, episode_number: 5 }),
    ];

    const result = groupByShowAndSeason(episodes);
    expect(result.size).toBe(1);
    expect(result.get("show-1")!.get(3)!.length).toBe(1);
    expect(result.get("show-1")!.get(3)![0].episode_number).toBe(5);
  });
});

describe("EPISODES_PER_PAGE", () => {
  it("is set to 5", () => {
    expect(EPISODES_PER_PAGE).toBe(5);
  });
});

describe("progressive reveal logic", () => {
  it("slice(0, EPISODES_PER_PAGE) shows first 5 of a longer list", () => {
    const episodes = Array.from({ length: 10 }, (_, i) =>
      makeEpisode({ id: i + 1, title_id: "show-1", season_number: 1, episode_number: i + 1 })
    );

    const visible = episodes.slice(0, EPISODES_PER_PAGE);
    expect(visible.length).toBe(5);
    expect(visible[0].episode_number).toBe(1);
    expect(visible[4].episode_number).toBe(5);
  });

  it("removing a watched episode reveals the next one in the window", () => {
    const episodes = Array.from({ length: 8 }, (_, i) =>
      makeEpisode({ id: i + 1, title_id: "show-1", season_number: 1, episode_number: i + 1 })
    );

    // Simulate marking episode 1 as watched (removed from array)
    const afterWatch = episodes.filter((ep) => ep.id !== 1);
    const visible = afterWatch.slice(0, EPISODES_PER_PAGE);

    expect(visible.length).toBe(5);
    expect(visible[0].episode_number).toBe(2);
    expect(visible[4].episode_number).toBe(6); // episode 6 is now visible
  });

  it("shows all episodes when list is shorter than limit", () => {
    const episodes = Array.from({ length: 3 }, (_, i) =>
      makeEpisode({ id: i + 1, title_id: "show-1", season_number: 1, episode_number: i + 1 })
    );

    const visible = episodes.slice(0, EPISODES_PER_PAGE);
    expect(visible.length).toBe(3);
  });
});

describe("episode toggle updater functions", () => {
  it("updateAll toggles is_watched for the target episode only", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 1, title_id: "show-1", season_number: 1, episode_number: 1, is_watched: false }),
      makeEpisode({ id: 2, title_id: "show-1", season_number: 1, episode_number: 2, is_watched: false }),
      makeEpisode({ id: 3, title_id: "show-1", season_number: 1, episode_number: 3, is_watched: true }),
    ];

    // Simulate the updateAll functional updater from toggleWatched
    const episodeId = 2;
    const currentlyWatched = false;
    const updateAll = (eps: Episode[]) =>
      eps.map((ep) => (ep.id === episodeId ? { ...ep, is_watched: !currentlyWatched } : ep));

    const result = updateAll(episodes);

    expect(result).toHaveLength(3);
    expect(result[0].is_watched).toBe(false); // unchanged
    expect(result[1].is_watched).toBe(true); // toggled
    expect(result[2].is_watched).toBe(true); // unchanged
    // Ensure it returns a new array (immutable update)
    expect(result).not.toBe(episodes);
  });

  it("revertAll restores is_watched for the target episode only", () => {
    // State after optimistic update: episode 2 was toggled to watched
    const episodes: Episode[] = [
      makeEpisode({ id: 1, title_id: "show-1", season_number: 1, episode_number: 1, is_watched: false }),
      makeEpisode({ id: 2, title_id: "show-1", season_number: 1, episode_number: 2, is_watched: true }),
      makeEpisode({ id: 3, title_id: "show-1", season_number: 1, episode_number: 3, is_watched: true }),
    ];

    const episodeId = 2;
    const currentlyWatched = false; // original state before toggle
    const revertAll = (eps: Episode[]) =>
      eps.map((ep) => (ep.id === episodeId ? { ...ep, is_watched: currentlyWatched } : ep));

    const result = revertAll(episodes);

    expect(result[0].is_watched).toBe(false); // unchanged
    expect(result[1].is_watched).toBe(false); // reverted
    expect(result[2].is_watched).toBe(true); // unchanged
  });

  it("updater works correctly as a React functional updater (called with prev state)", () => {
    const prevState: Episode[] = [
      makeEpisode({ id: 10, title_id: "show-x", season_number: 1, episode_number: 1, is_watched: false }),
      makeEpisode({ id: 20, title_id: "show-x", season_number: 1, episode_number: 2, is_watched: true }),
    ];

    const episodeId = 10;
    const currentlyWatched = false;
    const updateAll = (eps: Episode[]) =>
      eps.map((ep) => (ep.id === episodeId ? { ...ep, is_watched: !currentlyWatched } : ep));

    // Simulating how React calls functional updaters: setState(fn) → fn(prevState)
    const newState = updateAll(prevState);

    expect(Array.isArray(newState)).toBe(true);
    expect(newState).toHaveLength(2);
    expect(newState[0].is_watched).toBe(true);
    expect(newState[1].is_watched).toBe(true);
  });
});

describe("season ordering for deck-of-cards", () => {
  it("earliest season appears first when sorting season map entries", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 1, title_id: "show-1", season_number: 3, episode_number: 1 }),
      makeEpisode({ id: 2, title_id: "show-1", season_number: 1, episode_number: 1 }),
      makeEpisode({ id: 3, title_id: "show-1", season_number: 2, episode_number: 1 }),
    ];

    const grouped = groupByShowAndSeason(episodes);
    const seasonMap = grouped.get("show-1")!;
    const sortedSeasons = Array.from(seasonMap.entries()).sort(([a], [b]) => a - b);

    expect(sortedSeasons[0][0]).toBe(1);
    expect(sortedSeasons[1][0]).toBe(2);
    expect(sortedSeasons[2][0]).toBe(3);
  });

  it("counts extra seasons correctly for deck effect", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 1, title_id: "show-1", season_number: 1, episode_number: 1 }),
      makeEpisode({ id: 2, title_id: "show-1", season_number: 2, episode_number: 1 }),
      makeEpisode({ id: 3, title_id: "show-1", season_number: 3, episode_number: 1 }),
      makeEpisode({ id: 4, title_id: "show-1", season_number: 4, episode_number: 1 }),
    ];

    const grouped = groupByShowAndSeason(episodes);
    const seasonMap = grouped.get("show-1")!;
    const sortedSeasons = Array.from(seasonMap.entries()).sort(([a], [b]) => a - b);
    const extraSeasons = sortedSeasons.length - 1;

    expect(extraSeasons).toBe(3);
  });

  it("when all episodes of first season are removed, second season becomes first", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 1, title_id: "show-1", season_number: 1, episode_number: 1 }),
      makeEpisode({ id: 2, title_id: "show-1", season_number: 1, episode_number: 2 }),
      makeEpisode({ id: 3, title_id: "show-1", season_number: 2, episode_number: 1 }),
      makeEpisode({ id: 4, title_id: "show-1", season_number: 2, episode_number: 2 }),
    ];

    // Simulate watching all of season 1
    const afterWatch = episodes.filter((ep) => ep.season_number !== 1);
    const regrouped = groupByShowAndSeason(afterWatch);
    const seasonMap = regrouped.get("show-1")!;
    const sortedSeasons = Array.from(seasonMap.entries()).sort(([a], [b]) => a - b);

    expect(sortedSeasons.length).toBe(1);
    expect(sortedSeasons[0][0]).toBe(2); // Season 2 is now earliest
  });
});
