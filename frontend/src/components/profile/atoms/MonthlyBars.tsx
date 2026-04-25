import type { ProfileMonthlyActivity } from "../../../types";

interface MonthlyBarsProps {
  monthly: ProfileMonthlyActivity[];
  episodeColor?: string;
  movieColor?: string;
  height?: number;
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatMonth(month: string): string {
  const m = month.match(/^\d{4}-(\d{2})$/);
  if (!m) return month;
  const idx = Number(m[1]) - 1;
  return MONTH_SHORT[idx] ?? month;
}

export function MonthlyBars({
  monthly,
  episodeColor = "#fbbf24",
  movieColor = "oklch(0.68 0.13 240)",
  height = 120,
}: MonthlyBarsProps) {
  const maxTotal = Math.max(
    1,
    ...monthly.map((m) => m.episodes_watched + m.movies_watched),
  );
  const barArea = height - 20;

  return (
    <div className="flex items-end gap-2.5" style={{ height: `${height}px` }} data-testid="monthly-bars">
      {monthly.map((m) => {
        const total = m.episodes_watched + m.movies_watched;
        const totalPct = (total / maxTotal) * 100;
        const moviesPct = total > 0 ? (m.movies_watched / total) * 100 : 0;
        return (
          <div key={m.month} className="flex-1 flex flex-col items-center gap-1.5">
            <div
              className="w-full flex flex-col justify-end"
              style={{ height: `${barArea}px` }}
            >
              <div
                className="w-full rounded overflow-hidden flex flex-col"
                style={{ height: `${totalPct}%` }}
              >
                <div style={{ height: `${moviesPct}%`, background: movieColor }} />
                <div style={{ flex: 1, background: episodeColor }} />
              </div>
            </div>
            <div className="font-mono text-[10px] text-zinc-500 select-none">
              {formatMonth(m.month)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
