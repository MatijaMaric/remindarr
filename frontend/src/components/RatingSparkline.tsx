import type { RatingValue } from "../types";
import {
  sparklineLayout,
  sparklineTooltip,
  type RatingSparklinePoint,
} from "../lib/rating-sparkline";

export type { RatingSparklinePoint };

const RATING_FILL: Record<RatingValue, string> = {
  HATE: "#ef4444",
  DISLIKE: "#f97316",
  LIKE: "#3b82f6",
  LOVE: "#ec4899",
};

const WIDTH = 200;
const HEIGHT = 40;

export default function RatingSparkline({
  points,
  label = "Episode rating pacing",
  heading,
}: {
  points: RatingSparklinePoint[];
  label?: string;
  heading?: string;
}) {
  if (points.length === 0) return null;

  const { line, dots } = sparklineLayout(points, WIDTH, HEIGHT);

  return (
    <div data-testid="rating-sparkline" className="space-y-1.5">
      {heading ? (
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
          {heading}
        </p>
      ) : null}
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-10 text-zinc-500 overflow-visible"
        role="img"
        aria-label={label}
      >
        {line ? (
          <path d={line} fill="none" stroke="currentColor" strokeWidth="2" />
        ) : null}
        {dots.map((d) => (
          <circle
            key={`${d.point.season}-${d.point.episode}`}
            cx={d.x}
            cy={d.y}
            r={3.5}
            fill={RATING_FILL[d.point.rating]}
          >
            <title>{sparklineTooltip(d.point)}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
