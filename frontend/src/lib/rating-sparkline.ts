import type { RatingValue, EpisodeRatingPoint } from "../types";

export type RatingSparklinePoint = EpisodeRatingPoint;

/** Higher is hotter. Four-step scale matching HATE→LOVE. */
export const RATING_SCORE: Record<RatingValue, number> = {
  HATE: 0,
  DISLIKE: 1,
  LIKE: 2,
  LOVE: 3,
};

const MAX_SCORE = 3;

export function sparklineTooltip(point: RatingSparklinePoint): string {
  return `S${point.season}E${point.episode}: ${point.rating}`;
}

export function sparklineLayout(
  points: RatingSparklinePoint[],
  width: number,
  height: number,
  pad = 6,
): {
  line: string;
  dots: { x: number; y: number; point: RatingSparklinePoint }[];
} {
  if (points.length === 0) return { line: "", dots: [] };

  const innerW = Math.max(width - pad * 2, 0);
  const innerH = Math.max(height - pad * 2, 0);
  const n = points.length;

  const dots = points.map((point, i) => {
    const x = pad + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = pad + innerH - (RATING_SCORE[point.rating] / MAX_SCORE) * innerH;
    return { x, y, point };
  });

  const line =
    dots.length < 2
      ? ""
      : dots.map((d, i) => `${i === 0 ? "M" : "L"}${d.x} ${d.y}`).join(" ");

  return { line, dots };
}
