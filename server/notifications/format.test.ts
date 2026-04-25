import { describe, it, expect } from "bun:test";
import { formatProviderNames, groupEpisodesByShow } from "./format";
import type { NotificationEpisode } from "./types";

function makeEpisode(
  showTitle: string,
  seasonNumber: number,
  episodeNumber: number,
  offers: Array<{ providerName: string; providerIconUrl: string | null }> = []
): NotificationEpisode {
  return {
    showTitle,
    seasonNumber,
    episodeNumber,
    episodeName: null,
    posterUrl: null,
    offers,
  };
}

describe("groupEpisodesByShow", () => {
  it("returns an empty map when given no episodes", () => {
    const result = groupEpisodesByShow([]);
    expect(result.size).toBe(0);
  });

  it("groups episodes from the same show together", () => {
    const episodes = [
      makeEpisode("Show A", 1, 1),
      makeEpisode("Show A", 1, 2),
      makeEpisode("Show A", 2, 1),
    ];
    const result = groupEpisodesByShow(episodes);
    expect(result.size).toBe(1);
    expect(result.get("Show A")?.length).toBe(3);
  });

  it("preserves insertion order across distinct shows", () => {
    const episodes = [
      makeEpisode("Beta", 1, 1),
      makeEpisode("Alpha", 1, 1),
      makeEpisode("Beta", 1, 2),
      makeEpisode("Gamma", 1, 1),
    ];
    const result = groupEpisodesByShow(episodes);
    expect([...result.keys()]).toEqual(["Beta", "Alpha", "Gamma"]);
    expect(result.get("Beta")?.map((ep) => ep.episodeNumber)).toEqual([1, 2]);
  });

  it("preserves the original episode references", () => {
    const ep = makeEpisode("Show", 3, 4, [
      { providerName: "Netflix", providerIconUrl: null },
    ]);
    const result = groupEpisodesByShow([ep]);
    expect(result.get("Show")?.[0]).toBe(ep);
  });
});

describe("formatProviderNames", () => {
  it("returns an empty string for an empty list", () => {
    expect(formatProviderNames([])).toBe("");
  });

  it("joins unique provider names with a comma and space", () => {
    expect(
      formatProviderNames([
        { providerName: "Netflix", providerIconUrl: null },
        { providerName: "Hulu", providerIconUrl: null },
      ])
    ).toBe("Netflix, Hulu");
  });

  it("deduplicates repeated provider names while preserving first occurrence order", () => {
    expect(
      formatProviderNames([
        { providerName: "Netflix", providerIconUrl: null },
        { providerName: "Hulu", providerIconUrl: null },
        { providerName: "Netflix", providerIconUrl: "/icon.png" },
        { providerName: "Disney+", providerIconUrl: null },
        { providerName: "Hulu", providerIconUrl: null },
      ])
    ).toBe("Netflix, Hulu, Disney+");
  });

  it("returns a single name when only one provider is present", () => {
    expect(
      formatProviderNames([{ providerName: "Apple TV+", providerIconUrl: null }])
    ).toBe("Apple TV+");
  });
});
