import { describe, it, expect } from "bun:test";
import { buildUnwatchedCards } from "./HomePage";
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

describe("buildUnwatchedCards", () => {
  it("produces one card per show", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 1, title_id: "show-1", season_number: 1, episode_number: 1 }),
      makeEpisode({ id: 2, title_id: "show-1", season_number: 1, episode_number: 2 }),
      makeEpisode({ id: 3, title_id: "show-1", season_number: 2, episode_number: 1 }),
      makeEpisode({ id: 4, title_id: "show-2", season_number: 1, episode_number: 1 }),
    ];
    const cards = buildUnwatchedCards(episodes);

    expect(cards.length).toBe(2);
    expect(cards.map((c) => c.titleId).sort()).toEqual(["show-1", "show-2"]);
  });

  it("uses the first episode (lowest season/episode) as the representative", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 3, title_id: "show-1", season_number: 2, episode_number: 1 }),
      makeEpisode({ id: 1, title_id: "show-1", season_number: 1, episode_number: 1 }),
      makeEpisode({ id: 2, title_id: "show-1", season_number: 1, episode_number: 2 }),
    ];
    const cards = buildUnwatchedCards(episodes);

    expect(cards.length).toBe(1);
    expect(cards[0].episode.id).toBe(1);
    expect(cards[0].episode.season_number).toBe(1);
    expect(cards[0].episode.episode_number).toBe(1);
  });

  it("sets correct totalEpisodeCount across all seasons", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 1, title_id: "show-1", season_number: 1, episode_number: 1 }),
      makeEpisode({ id: 2, title_id: "show-1", season_number: 1, episode_number: 2 }),
      makeEpisode({ id: 3, title_id: "show-1", season_number: 2, episode_number: 1 }),
    ];
    const cards = buildUnwatchedCards(episodes);

    expect(cards[0].totalEpisodeCount).toBe(3);
  });

  it("sets correct allEpisodeIds sorted by season/episode", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 30, title_id: "show-1", season_number: 2, episode_number: 1 }),
      makeEpisode({ id: 10, title_id: "show-1", season_number: 1, episode_number: 1 }),
      makeEpisode({ id: 20, title_id: "show-1", season_number: 1, episode_number: 2 }),
    ];
    const cards = buildUnwatchedCards(episodes);

    expect(cards[0].allEpisodeIds).toEqual([10, 20, 30]);
  });

  it("orders shows by most recent air_date descending", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 1, title_id: "show-old", season_number: 1, episode_number: 1, air_date: "2025-01-01", show_title: "Old Show" }),
      makeEpisode({ id: 2, title_id: "show-new", season_number: 1, episode_number: 1, air_date: "2025-06-15", show_title: "New Show" }),
      makeEpisode({ id: 3, title_id: "show-mid", season_number: 1, episode_number: 1, air_date: "2025-03-10", show_title: "Mid Show" }),
    ];
    const cards = buildUnwatchedCards(episodes);

    expect(cards[0].titleId).toBe("show-new");
    expect(cards[1].titleId).toBe("show-mid");
    expect(cards[2].titleId).toBe("show-old");
  });

  it("uses most recent episode air_date for ordering when show has multiple episodes", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 1, title_id: "show-a", season_number: 1, episode_number: 1, air_date: "2025-01-01" }),
      makeEpisode({ id: 2, title_id: "show-a", season_number: 1, episode_number: 2, air_date: "2025-01-08" }),
      makeEpisode({ id: 3, title_id: "show-b", season_number: 1, episode_number: 1, air_date: "2025-01-05" }),
    ];
    const cards = buildUnwatchedCards(episodes);

    // show-a has most recent ep on 2025-01-08, show-b on 2025-01-05
    expect(cards[0].titleId).toBe("show-a");
    expect(cards[1].titleId).toBe("show-b");
  });

  it("returns empty array for empty input", () => {
    const cards = buildUnwatchedCards([]);
    expect(cards.length).toBe(0);
  });

  it("handles single episode", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 1, title_id: "show-1", season_number: 3, episode_number: 5 }),
    ];
    const cards = buildUnwatchedCards(episodes);

    expect(cards.length).toBe(1);
    expect(cards[0].totalEpisodeCount).toBe(1);
    expect(cards[0].allEpisodeIds).toEqual([1]);
  });
});

describe("episode toggle updater functions", () => {
  it("updateAll toggles is_watched for the target episode only", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 1, title_id: "show-1", season_number: 1, episode_number: 1, is_watched: false }),
      makeEpisode({ id: 2, title_id: "show-1", season_number: 1, episode_number: 2, is_watched: false }),
      makeEpisode({ id: 3, title_id: "show-1", season_number: 1, episode_number: 3, is_watched: true }),
    ];

    const episodeId = 2;
    const currentlyWatched = false;
    const updateAll = (eps: Episode[]) =>
      eps.map((ep) => (ep.id === episodeId ? { ...ep, is_watched: !currentlyWatched } : ep));

    const result = updateAll(episodes);

    expect(result).toHaveLength(3);
    expect(result[0].is_watched).toBe(false);
    expect(result[1].is_watched).toBe(true);
    expect(result[2].is_watched).toBe(true);
    expect(result).not.toBe(episodes);
  });

  it("revertAll restores is_watched for the target episode only", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 1, title_id: "show-1", season_number: 1, episode_number: 1, is_watched: false }),
      makeEpisode({ id: 2, title_id: "show-1", season_number: 1, episode_number: 2, is_watched: true }),
      makeEpisode({ id: 3, title_id: "show-1", season_number: 1, episode_number: 3, is_watched: true }),
    ];

    const episodeId = 2;
    const currentlyWatched = false;
    const revertAll = (eps: Episode[]) =>
      eps.map((ep) => (ep.id === episodeId ? { ...ep, is_watched: currentlyWatched } : ep));

    const result = revertAll(episodes);

    expect(result[0].is_watched).toBe(false);
    expect(result[1].is_watched).toBe(false);
    expect(result[2].is_watched).toBe(true);
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

    const newState = updateAll(prevState);

    expect(Array.isArray(newState)).toBe(true);
    expect(newState).toHaveLength(2);
    expect(newState[0].is_watched).toBe(true);
    expect(newState[1].is_watched).toBe(true);
  });
});
