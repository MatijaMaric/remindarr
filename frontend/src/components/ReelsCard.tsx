import { CheckCircle, Check } from "lucide-react";
import { Link } from "react-router";
import type { Episode, Offer } from "../types";
import WatchButton from "./WatchButton";

function formatEpisodeCode(ep: Episode): string {
  const s = String(ep.season_number).padStart(2, "0");
  const e = String(ep.episode_number).padStart(2, "0");
  return `S${s}E${e}`;
}

function formatAirDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dateStr === today;
}

function getUniqueProviders(offers?: Offer[]) {
  if (!offers?.length) return [];
  const map = new Map<number, Offer>();
  for (const o of offers) {
    if (o.monetization_type === "FLATRATE" || o.monetization_type === "FREE" || o.monetization_type === "ADS") {
      if (!map.has(o.provider_id)) map.set(o.provider_id, o);
    }
  }
  return Array.from(map.values());
}

export function getBackgroundImageUrl(episode: Episode): string | null {
  if (episode.still_path) {
    return `https://image.tmdb.org/t/p/w1280${episode.still_path}`;
  }
  if (episode.poster_url) {
    return episode.poster_url;
  }
  return null;
}

interface ReelsCardProps {
  episode: Episode;
  caughtUp: boolean;
  onMarkWatched: () => void;
  index: number;
  total: number;
}

export default function ReelsCard({ episode, caughtUp, onMarkWatched, index, total }: ReelsCardProps) {
  const bgUrl = getBackgroundImageUrl(episode);
  const providers = getUniqueProviders(episode.offers);
  const airDateFormatted = formatAirDate(episode.air_date);
  const isNew = isToday(episode.air_date);

  return (
    <div className="snap-start snap-always w-full relative flex-shrink-0 overflow-hidden" style={{ height: "calc(100dvh - 5rem)" }}>
      {/* Background image */}
      {bgUrl ? (
        <img
          src={bgUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-800 to-zinc-950" />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/90" />

      {/* Position indicator */}
      <div className="absolute top-4 right-4 z-10 bg-black/50 px-3 py-1 rounded-full text-xs text-white/80">
        {index + 1} / {total}
      </div>

      {/* Swipe hint */}
      {!caughtUp && (
        <div className="absolute top-4 left-4 z-10 bg-black/30 px-2 py-1 rounded-full text-[10px] text-white/50">
          Swipe left for season
        </div>
      )}

      {/* Bottom content */}
      <div className="absolute bottom-0 left-0 right-0 p-6 pb-4 z-10">
        {caughtUp ? (
          <div className="text-center py-8">
            <div className="inline-flex items-center gap-2 bg-green-500/20 text-green-400 px-4 py-2 rounded-full text-lg font-semibold mb-2">
              <Check size={20} />
              All caught up!
            </div>
            <p className="text-zinc-400 text-sm">{episode.show_title}</p>
          </div>
        ) : (
          <>
            {/* Show title - linked */}
            <Link to={`/title/${episode.title_id}`}>
              <h2 className="text-2xl font-bold text-white mb-1 drop-shadow-lg hover:text-amber-300 transition-colors">
                {episode.show_title}
              </h2>
            </Link>

            {/* Episode code + name - linked */}
            <Link to={`/title/${episode.title_id}/season/${episode.season_number}/episode/${episode.episode_number}`}>
              <p className="text-base text-white/90 font-medium mb-1 drop-shadow hover:text-amber-300 transition-colors">
                {formatEpisodeCode(episode)}
                {episode.name && ` · ${episode.name}`}
              </p>
            </Link>

            {/* Air date + NEW badge */}
            <div className="flex items-center gap-2 mb-2">
              {airDateFormatted && (
                <span className="text-sm text-white/60 drop-shadow">
                  {airDateFormatted}
                </span>
              )}
              {isNew && (
                <span className="bg-emerald-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                  NEW
                </span>
              )}
            </div>

            {/* Overview */}
            {episode.overview && (
              <p className="text-sm text-white/70 line-clamp-3 mb-4 drop-shadow">
                {episode.overview}
              </p>
            )}

            {/* Provider icons */}
            {providers.length > 0 && (
              <div className="flex gap-2 mb-4">
                {providers.map((p) => (
                  <WatchButton
                    key={p.provider_id}
                    url={p.url}
                    providerId={p.provider_id}
                    providerName={p.provider_name}
                    providerIconUrl={p.provider_icon_url}
                    variant="compact"
                  />
                ))}
              </div>
            )}

            {/* Watch on provider button */}
            {providers.length > 0 && (
              <div className="mb-2">
                <WatchButton
                  url={providers[0].url}
                  providerId={providers[0].provider_id}
                  providerName={providers[0].provider_name}
                  providerIconUrl={providers[0].provider_icon_url}
                  variant="full"
                />
              </div>
            )}

            {/* Mark as watched button */}
            <button
              onClick={onMarkWatched}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 px-6 py-3 rounded-xl text-base font-semibold transition-colors cursor-pointer w-full justify-center"
            >
              <CheckCircle size={20} />
              Mark as Watched
            </button>
          </>
        )}
      </div>
    </div>
  );
}
