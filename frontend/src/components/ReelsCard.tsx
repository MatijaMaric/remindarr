import { CheckCircle, Check } from "lucide-react";
import type { Episode, Offer } from "../types";

function formatEpisodeCode(ep: Episode): string {
  const s = String(ep.season_number).padStart(2, "0");
  const e = String(ep.episode_number).padStart(2, "0");
  return `S${s}E${e}`;
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

  return (
    <div className="snap-start h-dvh w-full relative flex-shrink-0 overflow-hidden">
      {/* Background image */}
      {bgUrl ? (
        <img
          src={bgUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-gray-800 to-gray-950" />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/90" />

      {/* Position indicator */}
      <div className="absolute top-4 right-4 z-10 bg-black/50 px-3 py-1 rounded-full text-xs text-white/80">
        {index + 1} / {total}
      </div>

      {/* Bottom content */}
      <div className="absolute bottom-0 left-0 right-0 p-6 pb-10 z-10">
        {caughtUp ? (
          <div className="text-center py-8">
            <div className="inline-flex items-center gap-2 bg-green-500/20 text-green-400 px-4 py-2 rounded-full text-lg font-semibold mb-2">
              <Check size={20} />
              All caught up!
            </div>
            <p className="text-gray-400 text-sm">{episode.show_title}</p>
          </div>
        ) : (
          <>
            {/* Show title */}
            <h2 className="text-2xl font-bold text-white mb-1 drop-shadow-lg">
              {episode.show_title}
            </h2>

            {/* Episode code + name */}
            <p className="text-base text-white/90 font-medium mb-2 drop-shadow">
              {formatEpisodeCode(episode)}
              {episode.name && ` · ${episode.name}`}
            </p>

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
                  <img
                    key={p.provider_id}
                    src={p.provider_icon_url}
                    alt={p.provider_name}
                    title={p.provider_name}
                    className="w-8 h-8 rounded-lg"
                    loading="lazy"
                  />
                ))}
              </div>
            )}

            {/* Mark as watched button */}
            <button
              onClick={onMarkWatched}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white px-6 py-3 rounded-xl text-base font-semibold transition-colors cursor-pointer w-full justify-center"
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
