import { Link } from "react-router";
import type { Episode, Offer } from "../types";
import WatchButtonGroup from "./WatchButtonGroup";
import WatchedToggleButton from "./WatchedToggleButton";

export function formatEpisodeCode(ep: Episode): string {
  const s = String(ep.season_number).padStart(2, "0");
  const e = String(ep.episode_number).padStart(2, "0");
  return `S${s}E${e}`;
}

// Provider IDs that are the same streaming service under different TMDB entries.
// Key = duplicate ID, value = canonical ID to collapse into.
const DUPLICATE_PROVIDER_IDS: Record<number, number> = {
  1899: 384,  // HBO Max (hbo_max) → HBO Max (hbo)
  119: 9,     // Amazon Prime Video → Prime Video
};

export function canonicalProviderId(id: number): number {
  return DUPLICATE_PROVIDER_IDS[id] ?? id;
}

function isTmdbUrl(url: string): boolean {
  return url.includes("themoviedb.org");
}

export function getUniqueProviders(offers?: Offer[]) {
  if (!offers?.length) return [];
  const map = new Map<number, Offer>();
  for (const o of offers) {
    if (o.monetization_type === "FLATRATE" || o.monetization_type === "FREE" || o.monetization_type === "ADS") {
      const key = canonicalProviderId(o.provider_id);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, o);
      } else if (isTmdbUrl(existing.url) && !isTmdbUrl(o.url)) {
        // Prefer a real streaming deep-link over a generic TMDB watch page
        map.set(key, o);
      }
    }
  }
  return Array.from(map.values());
}

export function groupByShow(episodes: Episode[]): Map<string, Episode[]> {
  const map = new Map<string, Episode[]>();
  for (const ep of episodes) {
    const key = ep.title_id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ep);
  }
  return map;
}

export function formatUpcomingDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.getTime() === tomorrow.getTime()) return "__TOMORROW__";

  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export function getEpisodeCardImageUrl(episode: Episode): string | null {
  if (episode.still_path) return `https://image.tmdb.org/t/p/w780${episode.still_path}`;
  if (episode.backdrop_url) return episode.backdrop_url;
  if (episode.poster_url) return episode.poster_url;
  return null;
}

export function isEpisodeReleased(ep: Episode): boolean {
  if (!ep.air_date) return false;
  const today = new Date().toISOString().slice(0, 10);
  return ep.air_date <= today;
}

export function WatchedIcon({ watched, onClick, disabled, size = "sm", compactOnMobile }: { watched: boolean; onClick: () => void; disabled?: boolean; size?: "sm" | "md"; compactOnMobile?: boolean }) {
  return <WatchedToggleButton watched={watched} onClick={onClick} disabled={disabled} size={size} compactOnMobile={compactOnMobile} />;
}

export function EpisodeCard({ episode, compact, onToggleWatched }: { episode: Episode; compact?: boolean; onToggleWatched: (id: number, current: boolean) => void }) {
  const unreleased = !isEpisodeReleased(episode);

  if (compact) {
    return (
      <div className="flex items-center gap-3 bg-zinc-900 rounded-lg p-3">
        {episode.poster_url && (
          <Link to={`/title/${episode.title_id}`} className="flex-shrink-0">
            <img
              src={episode.poster_url}
              alt={episode.show_title}
              className="w-10 h-15 rounded object-cover"
              loading="lazy"
            />
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <Link to={`/title/${episode.title_id}`} className="hover:text-amber-400 transition-colors">
            <p className="text-sm font-medium text-white truncate">{episode.show_title}</p>
          </Link>
          <Link to={`/title/${episode.title_id}/season/${episode.season_number}/episode/${episode.episode_number}`} className="hover:text-amber-400 transition-colors">
            <p className="text-xs text-zinc-400">
              {formatEpisodeCode(episode)}
              {episode.name && ` · ${episode.name}`}
            </p>
          </Link>
        </div>
        {!unreleased && (
          <div className="flex-shrink-0">
            <WatchButtonGroup offers={episode.offers ?? []} variant="dropdown" />
          </div>
        )}
        <div className="flex-shrink-0">
          <WatchedIcon watched={!!episode.is_watched} onClick={() => onToggleWatched(episode.id, !!episode.is_watched)} disabled={unreleased} size="md" compactOnMobile />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 rounded-xl overflow-hidden">
      <div className="flex gap-4 p-4">
        {episode.poster_url && (
          <Link to={`/title/${episode.title_id}`} className="flex-shrink-0">
            <img
              src={episode.poster_url}
              alt={episode.show_title}
              className="w-16 h-24 rounded-lg object-cover"
              loading="lazy"
            />
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <Link to={`/title/${episode.title_id}`} className="hover:text-amber-400 transition-colors">
            <h3 className="font-semibold text-white">{episode.show_title}</h3>
          </Link>
          <Link to={`/title/${episode.title_id}/season/${episode.season_number}/episode/${episode.episode_number}`} className="hover:text-amber-400 transition-colors">
            <p className="text-sm text-amber-400 font-medium mt-0.5">
              {formatEpisodeCode(episode)}
              {episode.name && ` · ${episode.name}`}
            </p>
          </Link>
          {episode.overview && (
            <p className="text-sm text-zinc-400 mt-2 line-clamp-2">{episode.overview}</p>
          )}
          {!unreleased && (
            <div className="mt-3">
              <WatchButtonGroup offers={episode.offers ?? []} variant="dropdown" />
            </div>
          )}
        </div>
        <div className="flex-shrink-0">
          <WatchedIcon watched={!!episode.is_watched} onClick={() => onToggleWatched(episode.id, !!episode.is_watched)} disabled={unreleased} size="md" compactOnMobile />
        </div>
      </div>
    </div>
  );
}

export function ShowEpisodeGroup({ showTitle, episodes, posterUrl, compact, onToggleWatched }: {
  showTitle: string;
  episodes: Episode[];
  posterUrl: string | null;
  compact?: boolean;
  onToggleWatched: (id: number, current: boolean) => void;
}) {
  if (episodes.length === 1) {
    return <EpisodeCard episode={episodes[0]} compact={compact} onToggleWatched={onToggleWatched} />;
  }

  const allUnreleased = episodes.every((ep) => !isEpisodeReleased(ep));

  if (compact) {
    return (
      <div className="flex items-center gap-3 bg-zinc-900 rounded-lg p-3">
        {posterUrl && (
          <Link to={`/title/${episodes[0].title_id}`} className="flex-shrink-0">
            <img src={posterUrl} alt={showTitle} className="w-10 h-15 rounded object-cover" loading="lazy" />
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <Link to={`/title/${episodes[0].title_id}`} className="hover:text-amber-400 transition-colors">
            <p className="text-sm font-medium text-white truncate">{showTitle}</p>
          </Link>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {episodes.map((ep) => (
              <div key={ep.id} className="flex items-center gap-1">
                <WatchedIcon watched={!!ep.is_watched} onClick={() => onToggleWatched(ep.id, !!ep.is_watched)} disabled={!isEpisodeReleased(ep)} compactOnMobile />
                <Link to={`/title/${ep.title_id}/season/${ep.season_number}/episode/${ep.episode_number}`} className="hover:text-amber-400 transition-colors">
                  <span className="text-xs text-zinc-400">{formatEpisodeCode(ep)}</span>
                </Link>
              </div>
            ))}
          </div>
        </div>
        {!allUnreleased && (
          <div className="flex-shrink-0">
            <WatchButtonGroup offers={episodes[0].offers ?? []} variant="dropdown" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 rounded-xl overflow-hidden">
      <div className="flex gap-4 p-4">
        {posterUrl && (
          <Link to={`/title/${episodes[0].title_id}`} className="flex-shrink-0">
            <img src={posterUrl} alt={showTitle} className="w-16 h-24 rounded-lg object-cover" loading="lazy" />
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <Link to={`/title/${episodes[0].title_id}`} className="hover:text-amber-400 transition-colors">
            <h3 className="font-semibold text-white">{showTitle}</h3>
          </Link>
          <div className="mt-2 space-y-1">
            {episodes.map((ep) => (
              <div key={ep.id} className="flex items-center gap-2 text-sm">
                <Link to={`/title/${ep.title_id}/season/${ep.season_number}/episode/${ep.episode_number}`} className="flex-1 min-w-0 hover:text-amber-400 transition-colors">
                  <span className="text-amber-400 font-medium">{formatEpisodeCode(ep)}</span>
                  {ep.name && <span className="text-zinc-400"> · {ep.name}</span>}
                </Link>
                <div className="flex-shrink-0">
                  <WatchedIcon watched={!!ep.is_watched} onClick={() => onToggleWatched(ep.id, !!ep.is_watched)} disabled={!isEpisodeReleased(ep)} size="md" compactOnMobile />
                </div>
              </div>
            ))}
          </div>
          {!allUnreleased && (
            <div className="mt-3">
              <WatchButtonGroup offers={episodes[0].offers ?? []} variant="dropdown" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
