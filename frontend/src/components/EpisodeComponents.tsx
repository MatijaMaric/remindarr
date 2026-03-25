import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { Episode, Offer } from "../types";

export function formatEpisodeCode(ep: Episode): string {
  const s = String(ep.season_number).padStart(2, "0");
  const e = String(ep.episode_number).padStart(2, "0");
  return `S${s}E${e}`;
}

export function getUniqueProviders(offers?: Offer[]) {
  if (!offers?.length) return [];
  const map = new Map<number, Offer>();
  for (const o of offers) {
    if (o.monetization_type === "FLATRATE" || o.monetization_type === "FREE" || o.monetization_type === "ADS") {
      if (!map.has(o.provider_id)) map.set(o.provider_id, o);
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

export function WatchedIcon({ watched, onClick, disabled }: { watched: boolean; onClick: () => void; disabled?: boolean }) {
  const { t } = useTranslation();
  if (disabled) {
    return (
      <span
        className="flex-shrink-0 text-zinc-700 cursor-not-allowed"
        aria-label={t("episodes.notYetReleased")}
        role="img"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
        </svg>
      </span>
    );
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-pressed={watched}
      aria-label={watched ? t("episodes.markAsUnwatched") : t("episodes.markAsWatched")}
      className={`flex-shrink-0 cursor-pointer transition-colors ${
        watched ? "text-emerald-500 hover:text-zinc-500" : "text-zinc-600 hover:text-emerald-500"
      }`}
    >
      {watched ? (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
        </svg>
      )}
    </button>
  );
}

export function EpisodeCard({ episode, compact, onToggleWatched }: { episode: Episode; compact?: boolean; onToggleWatched: (id: number, current: boolean) => void }) {
  const providers = getUniqueProviders(episode.offers);
  const unreleased = !isEpisodeReleased(episode);

  if (compact) {
    return (
      <div className="flex items-center gap-3 bg-zinc-900 rounded-lg p-3">
        <WatchedIcon watched={!!episode.is_watched} onClick={() => onToggleWatched(episode.id, !!episode.is_watched)} disabled={unreleased} />
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
        {providers.length > 0 && (
          <div className="flex gap-1 flex-shrink-0">
            {providers.slice(0, 3).map((o) => (
              <a key={o.provider_id} href={o.url} target="_blank" rel="noopener noreferrer" title={o.provider_name}>
                <img src={o.provider_icon_url} alt={o.provider_name} className="w-6 h-6 rounded" loading="lazy" />
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 rounded-xl overflow-hidden">
      <div className="flex gap-4 p-4">
        <WatchedIcon watched={!!episode.is_watched} onClick={() => onToggleWatched(episode.id, !!episode.is_watched)} disabled={unreleased} />
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
          {providers.length > 0 && (
            <div className="flex gap-1.5 mt-3">
              {providers.map((o) => (
                <a key={o.provider_id} href={o.url} target="_blank" rel="noopener noreferrer" title={o.provider_name}>
                  <img src={o.provider_icon_url} alt={o.provider_name} className="w-7 h-7 rounded-md" loading="lazy" />
                </a>
              ))}
            </div>
          )}
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

  const providers = getUniqueProviders(episodes[0].offers);

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
                <WatchedIcon watched={!!ep.is_watched} onClick={() => onToggleWatched(ep.id, !!ep.is_watched)} disabled={!isEpisodeReleased(ep)} />
                <Link to={`/title/${ep.title_id}/season/${ep.season_number}/episode/${ep.episode_number}`} className="hover:text-amber-400 transition-colors">
                  <span className="text-xs text-zinc-400">{formatEpisodeCode(ep)}</span>
                </Link>
              </div>
            ))}
          </div>
        </div>
        {providers.length > 0 && (
          <div className="flex gap-1 flex-shrink-0">
            {providers.slice(0, 3).map((o) => (
              <a key={o.provider_id} href={o.url} target="_blank" rel="noopener noreferrer" title={o.provider_name}>
                <img src={o.provider_icon_url} alt={o.provider_name} className="w-6 h-6 rounded" loading="lazy" />
              </a>
            ))}
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
                <WatchedIcon watched={!!ep.is_watched} onClick={() => onToggleWatched(ep.id, !!ep.is_watched)} disabled={!isEpisodeReleased(ep)} />
                <Link to={`/title/${ep.title_id}/season/${ep.season_number}/episode/${ep.episode_number}`} className="hover:text-amber-400 transition-colors">
                  <span className="text-amber-400 font-medium">{formatEpisodeCode(ep)}</span>
                  {ep.name && <span className="text-zinc-400"> · {ep.name}</span>}
                </Link>
              </div>
            ))}
          </div>
          {providers.length > 0 && (
            <div className="flex gap-1.5 mt-3">
              {providers.map((o) => (
                <a key={o.provider_id} href={o.url} target="_blank" rel="noopener noreferrer" title={o.provider_name}>
                  <img src={o.provider_icon_url} alt={o.provider_name} className="w-7 h-7 rounded-md" loading="lazy" />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
