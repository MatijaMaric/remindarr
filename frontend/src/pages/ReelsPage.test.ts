import { describe, it, expect } from "bun:test";
import { getFirstUnwatchedPerShow } from "./ReelsPage";
import type { Episode } from "../types";

function makeEpisode(
  overrides: Partial<Episode> & { id: number; title_id: string; season_number: number; episode_number: number }
): Episode {
  return {
    name: `Episode ${overrides.episode_number}`,
    overview: null,
    air_date: "2025-01-01",
    still_path: null,
    show_title: overrides.title_id === "show-1" ? "Show One" : "Show Two",
    poster_url: null,
    ...overrides,
  };
}

describe("getFirstUnwatchedPerShow", () => {
  it("returns empty array for empty input", () => {
    expect(getFirstUnwatchedPerShow([])).toEqual([]);
  });

  it("groups episodes by show and sorts by season then episode", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 3, title_id: "show-1", season_number: 2, episode_number: 1 }),
      makeEpisode({ id: 1, title_id: "show-1", season_number: 1, episode_number: 1 }),
      makeEpisode({ id: 2, title_id: "show-1", season_number: 1, episode_number: 2 }),
      makeEpisode({ id: 4, title_id: "show-2", season_number: 1, episode_number: 1 }),
    ];

    const cards = getFirstUnwatchedPerShow(episodes);

    expect(cards.length).toBe(2);

    const show1 = cards.find((c) => c.titleId === "show-1")!;
    expect(show1.episodes.length).toBe(3);
    expect(show1.episodes[0].id).toBe(1); // S01E01
    expect(show1.episodes[1].id).toBe(2); // S01E02
    expect(show1.episodes[2].id).toBe(3); // S02E01
    expect(show1.currentIndex).toBe(0);
    expect(show1.caughtUp).toBe(false);

    const show2 = cards.find((c) => c.titleId === "show-2")!;
    expect(show2.episodes.length).toBe(1);
  });

  it("handles single episode", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 1, title_id: "show-1", season_number: 3, episode_number: 5 }),
    ];

    const cards = getFirstUnwatchedPerShow(episodes);
    expect(cards.length).toBe(1);
    expect(cards[0].titleId).toBe("show-1");
    expect(cards[0].episodes.length).toBe(1);
    expect(cards[0].episodes[0].season_number).toBe(3);
    expect(cards[0].episodes[0].episode_number).toBe(5);
  });

  it("uses show_title and poster_url from first sorted episode", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 2, title_id: "show-1", season_number: 2, episode_number: 1, show_title: "Show One", poster_url: "/poster2.jpg" }),
      makeEpisode({ id: 1, title_id: "show-1", season_number: 1, episode_number: 1, show_title: "Show One", poster_url: "/poster1.jpg" }),
    ];

    const cards = getFirstUnwatchedPerShow(episodes);
    expect(cards[0].showTitle).toBe("Show One");
    expect(cards[0].posterUrl).toBe("/poster1.jpg");
  });

  it("sorts episodes correctly across multiple seasons", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 5, title_id: "show-1", season_number: 3, episode_number: 2 }),
      makeEpisode({ id: 4, title_id: "show-1", season_number: 3, episode_number: 1 }),
      makeEpisode({ id: 2, title_id: "show-1", season_number: 1, episode_number: 3 }),
      makeEpisode({ id: 1, title_id: "show-1", season_number: 1, episode_number: 1 }),
      makeEpisode({ id: 3, title_id: "show-1", season_number: 2, episode_number: 1 }),
    ];

    const cards = getFirstUnwatchedPerShow(episodes);
    const ids = cards[0].episodes.map((e) => e.id);
    expect(ids).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("ShowCard advancement logic", () => {
  it("advancing currentIndex past all episodes means caught up", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 1, title_id: "show-1", season_number: 1, episode_number: 1 }),
      makeEpisode({ id: 2, title_id: "show-1", season_number: 1, episode_number: 2 }),
    ];

    const cards = getFirstUnwatchedPerShow(episodes);
    const card = cards[0];

    // Simulate marking episodes watched
    const afterFirst = { ...card, currentIndex: card.currentIndex + 1 };
    expect(afterFirst.currentIndex).toBe(1);
    expect(afterFirst.currentIndex < afterFirst.episodes.length).toBe(true);

    const afterSecond = afterFirst.currentIndex + 1;
    expect(afterSecond >= card.episodes.length).toBe(true); // caught up
  });

  it("single episode show becomes caught up after one mark", () => {
    const episodes: Episode[] = [
      makeEpisode({ id: 1, title_id: "show-1", season_number: 1, episode_number: 1 }),
    ];

    const cards = getFirstUnwatchedPerShow(episodes);
    const nextIndex = cards[0].currentIndex + 1;
    expect(nextIndex >= cards[0].episodes.length).toBe(true);
  });
});
