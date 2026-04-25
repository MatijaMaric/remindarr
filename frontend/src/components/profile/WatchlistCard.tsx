import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { Title } from "../../types";

interface WatchlistCardProps {
  title: Title;
}

interface StatusMeta {
  labelKey: string;
  color: string;
  background: string;
}

function deriveStatus(t: Title): StatusMeta {
  const user = t.user_status ?? null;
  const show = t.show_status ?? null;
  const key = user ?? show;
  switch (key) {
    case "watching":
      return { labelKey: "userProfile.dossier.status.watching", color: "#000", background: "#fbbf24" };
    case "caught_up":
      return {
        labelKey: "userProfile.dossier.status.caughtUp",
        color: "#000",
        background: "oklch(0.72 0.14 180)",
      };
    case "completed":
      return {
        labelKey: "userProfile.dossier.status.completed",
        color: "#000",
        background: "oklch(0.72 0.16 145)",
      };
    case "on_hold":
      return {
        labelKey: "userProfile.dossier.status.onHold",
        color: "#000",
        background: "oklch(0.78 0.16 90)",
      };
    case "plan_to_watch":
      return {
        labelKey: "userProfile.dossier.status.planToWatch",
        color: "#000",
        background: "oklch(0.68 0.13 240)",
      };
    case "dropped":
      return {
        labelKey: "userProfile.dossier.status.dropped",
        color: "#fff",
        background: "oklch(0.55 0.18 25)",
      };
    default:
      return {
        labelKey: "userProfile.dossier.status.watching",
        color: "#000",
        background: "#fbbf24",
      };
  }
}

function progressPct(t: Title): number | null {
  const watched = t.watched_episodes_count ?? 0;
  const released = t.released_episodes_count ?? 0;
  if (released <= 0) return null;
  return Math.min(100, Math.round((watched / released) * 100));
}

function primaryProvider(t: Title): string | null {
  const offers = t.offers ?? [];
  if (offers.length === 0) return null;
  const priority = ["FLATRATE", "FREE", "ADS"] as const;
  for (const p of priority) {
    const match = offers.find((o) => o.monetization_type === p);
    if (match) return match.provider_name;
  }
  return offers[0]!.provider_name;
}

export default function WatchlistCard({ title }: WatchlistCardProps) {
  const { t } = useTranslation();
  const status = deriveStatus(title);
  const pct = progressPct(title);
  const provider = primaryProvider(title);
  const isMovie = title.object_type === "MOVIE";
  const meta = isMovie
    ? [title.release_year, provider].filter(Boolean).join(" · ")
    : [
        `${title.watched_episodes_count ?? 0}/${title.released_episodes_count ?? 0} ep`,
        provider,
      ]
        .filter(Boolean)
        .join(" · ");

  return (
    <Link
      to={`/title/${title.id}`}
      className="bg-zinc-900 border border-white/[0.06] rounded-lg overflow-hidden flex flex-col hover:border-white/[0.15] transition-colors group"
      data-testid="watchlist-card"
    >
      <div className="relative aspect-[16/9] bg-zinc-800">
        {title.poster_url ? (
          <img
            src={title.poster_url}
            alt={title.title}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-950" />
        )}
        <span
          className="absolute top-2 left-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] px-2 py-0.5 rounded"
          style={{ color: status.color, background: status.background }}
        >
          {t(status.labelKey)}
        </span>
        {pct !== null && (
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/40">
            <div
              className="h-full bg-amber-400"
              style={{ width: `${pct}%` }}
              data-testid="watchlist-progress"
            />
          </div>
        )}
      </div>
      <div className="px-3 py-2.5">
        <div className="text-[13px] font-semibold text-zinc-100 truncate mb-0.5">{title.title}</div>
        <div className="font-mono text-[11px] text-zinc-400 truncate">{meta || "—"}</div>
      </div>
    </Link>
  );
}
