import { describe, expect, it } from "bun:test";
import { sparklineLayout, sparklineTooltip } from "./rating-sparkline";

describe("sparklineTooltip", () => {
  it("formats S{season}E{episode}: {rating}", () => {
    expect(sparklineTooltip({ season: 1, episode: 5, rating: "DISLIKE" })).toBe(
      "S1E5: DISLIKE",
    );
    expect(sparklineTooltip({ season: 2, episode: 10, rating: "LOVE" })).toBe(
      "S2E10: LOVE",
    );
  });
});

describe("sparklineLayout", () => {
  it("returns empty geometry for no points", () => {
    expect(sparklineLayout([], 100, 40)).toEqual({ line: "", dots: [] });
  });

  it("places a single point in the horizontal center with no line", () => {
    const { line, dots } = sparklineLayout(
      [{ season: 1, episode: 1, rating: "LIKE" }],
      100,
      40,
      10,
    );
    expect(line).toBe("");
    expect(dots).toHaveLength(1);
    expect(dots[0].x).toBe(50);
  });

  it("puts LOVE at the top and HATE at the bottom", () => {
    const { dots } = sparklineLayout(
      [
        { season: 1, episode: 1, rating: "LOVE" },
        { season: 1, episode: 2, rating: "HATE" },
      ],
      100,
      40,
      0,
    );
    expect(dots[0].y).toBeLessThan(dots[1].y);
    expect(dots[0].y).toBe(0);
    expect(dots[1].y).toBe(40);
  });
});
