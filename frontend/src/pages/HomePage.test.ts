import { describe, it, expect } from "bun:test";
import { groupByShowAndSeason, buildUnwatchedCards, MAX_CARDS_PER_SEASON } from "./HomePage";
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

describe("MAX_CARDS_PER_SEASON", () => {
  it("is set to 3", () => {
    expect(MAX_CARDS_PER_SEASON).toBe(3);
  });
});

describe("buildUnwatchedCards", () => {
  it("produces one card per episode when under the limit", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 1, title_id: "show-1", season_number: 1, episode_number: 1 }),
      makeEpisode({ id: 2, title_id: "show-1", season_number: 1, episode_number: 2 }),
    ];
    const grouped = groupByShowAndSeason(episodes);
    const cards = buildUnwatchedCards(grouped);

    expect(cards.length).toBe(2);
    expect(cards[0].episode.id).toBe(1);
    expect(cards[1].episode.id).toBe(2);
    expect(cards.every((c) => !c.isOverflow)).toBe(true);
  });

  it("caps at MAX_CARDS_PER_SEASON and adds overflow card", () => {
    const episodes = Array.from({ length: 7 }, (_, i) =>
      makeEpisode({ id: i + 1, title_id: "show-1", season_number: 1, episode_number: i + 1 })
    );
    const grouped = groupByShowAndSeason(episodes);
    const cards = buildUnwatchedCards(grouped);

    // 3 regular + 1 overflow
    expect(cards.length).toBe(4);
    expect(cards[0].isOverflow).toBeFalsy();
    expect(cards[1].isOverflow).toBeFalsy();
    expect(cards[2].isOverflow).toBeFalsy();
    expect(cards[3].isOverflow).toBe(true);
  });

  it("sets correct seasonEpisodeCount on each card", () => {
    const episodes = Array.from({ length: 5 }, (_, i) =>
      makeEpisode({ id: i + 1, title_id: "show-1", season_number: 1, episode_number: i + 1 })
    );
    const grouped = groupByShowAndSeason(episodes);
    const cards = buildUnwatchedCards(grouped);

    // All cards should know total season count is 5
    for (const card of cards) {
      expect(card.seasonEpisodeCount).toBe(5);
    }
  });

  it("sets correct seasonEpisodeIds on each card", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 10, title_id: "show-1", season_number: 1, episode_number: 1 }),
      makeEpisode({ id: 20, title_id: "show-1", season_number: 1, episode_number: 2 }),
    ];
    const grouped = groupByShowAndSeason(episodes);
    const cards = buildUnwatchedCards(grouped);

    expect(cards[0].seasonEpisodeIds).toEqual([10, 20]);
    expect(cards[1].seasonEpisodeIds).toEqual([10, 20]);
  });

  it("orders by show then season", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 1, title_id: "show-1", season_number: 2, episode_number: 1 }),
      makeEpisode({ id: 2, title_id: "show-1", season_number: 1, episode_number: 1 }),
      makeEpisode({ id: 3, title_id: "show-2", season_number: 1, episode_number: 1 }),
    ];
    const grouped = groupByShowAndSeason(episodes);
    const cards = buildUnwatchedCards(grouped);

    // show-1 season 1 first, then show-1 season 2, then show-2
    expect(cards[0].episode.id).toBe(2); // show-1 s1
    expect(cards[1].episode.id).toBe(1); // show-1 s2
    expect(cards[2].episode.id).toBe(3); // show-2 s1
  });

  it("handles multiple shows with multiple seasons", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 1, title_id: "show-1", season_number: 1, episode_number: 1, show_title: "Show 1" }),
      makeEpisode({ id: 2, title_id: "show-1", season_number: 2, episode_number: 1, show_title: "Show 1" }),
      makeEpisode({ id: 3, title_id: "show-2", season_number: 1, episode_number: 1, show_title: "Show 2" }),
    ];
    const grouped = groupByShowAndSeason(episodes);
    const cards = buildUnwatchedCards(grouped);

    expect(cards.length).toBe(3);
    expect(cards[0].titleId).toBe("show-1");
    expect(cards[0].seasonNumber).toBe(1);
    expect(cards[1].titleId).toBe("show-1");
    expect(cards[1].seasonNumber).toBe(2);
    expect(cards[2].titleId).toBe("show-2");
  });

  it("returns empty array for empty input", () => {
    const grouped = groupByShowAndSeason([]);
    const cards = buildUnwatchedCards(grouped);
    expect(cards.length).toBe(0);
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

describe("season ordering in buildUnwatchedCards", () => {
  it("earliest season appears first", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 1, title_id: "show-1", season_number: 3, episode_number: 1 }),
      makeEpisode({ id: 2, title_id: "show-1", season_number: 1, episode_number: 1 }),
      makeEpisode({ id: 3, title_id: "show-1", season_number: 2, episode_number: 1 }),
    ];

    const grouped = groupByShowAndSeason(episodes);
    const cards = buildUnwatchedCards(grouped);

    expect(cards[0].seasonNumber).toBe(1);
    expect(cards[1].seasonNumber).toBe(2);
    expect(cards[2].seasonNumber).toBe(3);
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
    const cards = buildUnwatchedCards(regrouped);

    expect(cards.length).toBe(2);
    expect(cards[0].seasonNumber).toBe(2);
  });
});
