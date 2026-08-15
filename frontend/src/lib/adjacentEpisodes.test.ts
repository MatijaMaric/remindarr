import { describe, it, expect } from "bun:test";
import { formatEpisodeCode, getAdjacentEpisodes } from "./adjacentEpisodes";

const eps = (...numbers: number[]) =>
  numbers.map((episode_number) => ({ episode_number }));

const seasons = (...rows: { season_number: number; episode_count: number }[]) =>
  rows;

describe("formatEpisodeCode", () => {
  it("pads season and episode to two digits", () => {
    expect(formatEpisodeCode(3, 4)).toBe("S03E04");
  });
});

describe("getAdjacentEpisodes", () => {
  const twoSeasons = seasons(
    { season_number: 1, episode_count: 3 },
    { season_number: 2, episode_count: 5 },
  );

  it("returns in-season neighbors in the middle of a season", () => {
    expect(
      getAdjacentEpisodes({ season: 1, episode: 2 }, eps(1, 2, 3), twoSeasons),
    ).toEqual({
      prev: { season: 1, episode: 1 },
      next: { season: 1, episode: 3 },
    });
  });

  it("crosses to the previous season from the first episode", () => {
    expect(
      getAdjacentEpisodes({ season: 2, episode: 1 }, eps(1, 2, 3), twoSeasons),
    ).toEqual({
      prev: { season: 1, episode: 3 },
      next: { season: 2, episode: 2 },
    });
  });

  it("crosses to the next season from the last episode", () => {
    expect(
      getAdjacentEpisodes({ season: 1, episode: 3 }, eps(1, 2, 3), twoSeasons),
    ).toEqual({
      prev: { season: 1, episode: 2 },
      next: { season: 2, episode: 1 },
    });
  });

  it("omits previous on the first episode of the show", () => {
    expect(
      getAdjacentEpisodes({ season: 1, episode: 1 }, eps(1, 2, 3), twoSeasons),
    ).toEqual({
      prev: null,
      next: { season: 1, episode: 2 },
    });
  });

  it("omits next on the last episode of the show", () => {
    expect(
      getAdjacentEpisodes(
        { season: 2, episode: 5 },
        eps(1, 2, 3, 4, 5),
        twoSeasons,
      ),
    ).toEqual({
      prev: { season: 2, episode: 4 },
      next: null,
    });
  });

  it("walks by list index so episode-number gaps are skipped", () => {
    expect(
      getAdjacentEpisodes({ season: 1, episode: 2 }, eps(1, 2, 4), twoSeasons),
    ).toEqual({
      prev: { season: 1, episode: 1 },
      next: { season: 1, episode: 4 },
    });
  });

  it("does not invent a previous last-episode when episode_count is 0", () => {
    expect(
      getAdjacentEpisodes(
        { season: 2, episode: 1 },
        eps(1, 2),
        seasons(
          { season_number: 1, episode_count: 0 },
          { season_number: 2, episode_count: 2 },
        ),
      ),
    ).toEqual({
      prev: null,
      next: { season: 2, episode: 2 },
    });
  });

  it("navigates season 0 only within that season's list", () => {
    expect(
      getAdjacentEpisodes({ season: 0, episode: 1 }, eps(1, 2), twoSeasons),
    ).toEqual({
      prev: null,
      next: { season: 0, episode: 2 },
    });
    expect(
      getAdjacentEpisodes({ season: 0, episode: 2 }, eps(1, 2), twoSeasons),
    ).toEqual({
      prev: { season: 0, episode: 1 },
      next: null,
    });
  });
});
