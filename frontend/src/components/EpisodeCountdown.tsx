import { useState, useEffect } from "react";

interface Props {
  airDate: string | null | undefined;
}

/**
 * Compute the human-readable countdown string for a given airDate.
 * Returns null when airDate is absent or more than 15 minutes in the past.
 */
function getCountdownText(airDate: string | null | undefined): string | null {
  if (!airDate) return null;
  const diff = new Date(airDate).getTime() - Date.now();
  // Treat episodes that aired more than 15 minutes ago as "past"
  if (diff < -15 * 60 * 1000) return null;
  if (diff <= 0) return "airing";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Live-updating countdown badge. Shows "Xd Xh Xm" until the air date,
 * or "TBA" when the air date is null / already in the past (beyond 15 minutes).
 *
 * Uses a ticker state that increments every second to trigger re-renders,
 * then derives the display text from `airDate` at render time.
 */
export default function EpisodeCountdown({ airDate }: Props) {
  // Ticker is incremented every second to force a re-render; the actual
  // countdown text is computed from airDate at render time (no stale state).
  const [_ticker, setTicker] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setTicker((n) => n + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const text = getCountdownText(airDate);

  if (!text) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-zinc-800/80 border border-white/[0.08] text-zinc-400 font-mono text-[11px] font-semibold select-none">
        TBA
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-[11px] font-semibold select-none">
      <span aria-hidden="true">⏱</span>
      {text}
    </span>
  );
}
