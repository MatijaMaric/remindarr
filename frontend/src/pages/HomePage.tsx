import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import * as api from "../api";
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

function groupByShow(episodes: Episode[]): Map<string, Episode[]> {
  const map = new Map<string, Episode[]>();
  for (const ep of episodes) {
    const key = ep.title_id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ep);
  }
  return map;
}

function formatUpcomingDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.getTime() === tomorrow.getTime()) return "Tomorrow";

  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function EpisodeCard({ episode, compact }: { episode: Episode; compact?: boolean }) {
  const providers = getUniqueProviders(episode.offers);

  if (compact) {
    return (
      <div className="flex items-center gap-3 bg-gray-900 rounded-lg border border-gray-800 p-3">
        {episode.poster_url && (
          <img
            src={episode.poster_url}
            alt={episode.show_title}
            className="w-10 h-15 rounded object-cover flex-shrink-0"
            loading="lazy"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{episode.show_title}</p>
          <p className="text-xs text-gray-400">
            {formatEpisodeCode(episode)}
            {episode.name && ` · ${episode.name}`}
          </p>
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
    <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800 hover:border-gray-700 transition-colors">
      <div className="flex gap-4 p-4">
        {episode.poster_url && (
          <img
            src={episode.poster_url}
            alt={episode.show_title}
            className="w-16 h-24 rounded-lg object-cover flex-shrink-0"
            loading="lazy"
          />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white">{episode.show_title}</h3>
          <p className="text-sm text-indigo-400 font-medium mt-0.5">
            {formatEpisodeCode(episode)}
            {episode.name && ` · ${episode.name}`}
          </p>
          {episode.overview && (
            <p className="text-sm text-gray-400 mt-2 line-clamp-2">{episode.overview}</p>
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

function ShowEpisodeGroup({ showTitle, episodes, posterUrl, compact }: {
  showTitle: string;
  episodes: Episode[];
  posterUrl: string | null;
  compact?: boolean;
}) {
  if (episodes.length === 1) {
    return <EpisodeCard episode={episodes[0]} compact={compact} />;
  }

  const providers = getUniqueProviders(episodes[0].offers);

  if (compact) {
    return (
      <div className="flex items-center gap-3 bg-gray-900 rounded-lg border border-gray-800 p-3">
        {posterUrl && (
          <img src={posterUrl} alt={showTitle} className="w-10 h-15 rounded object-cover flex-shrink-0" loading="lazy" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{showTitle}</p>
          <p className="text-xs text-gray-400">
            {episodes.map((ep) => formatEpisodeCode(ep)).join(", ")}
          </p>
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
    <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800 hover:border-gray-700 transition-colors">
      <div className="flex gap-4 p-4">
        {posterUrl && (
          <img src={posterUrl} alt={showTitle} className="w-16 h-24 rounded-lg object-cover flex-shrink-0" loading="lazy" />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white">{showTitle}</h3>
          <div className="mt-2 space-y-1">
            {episodes.map((ep) => (
              <div key={ep.id} className="text-sm">
                <span className="text-indigo-400 font-medium">{formatEpisodeCode(ep)}</span>
                {ep.name && <span className="text-gray-400"> · {ep.name}</span>}
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

export default function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const [today, setToday] = useState<Episode[]>([]);
  const [upcoming, setUpcoming] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const data = await api.getUpcomingEpisodes();
        setToday(data.today);
        setUpcoming(data.upcoming);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, authLoading]);

  if (authLoading || loading) {
    return <div className="text-gray-500 text-center py-12">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-white mb-2">Welcome to Remindarr</h2>
        <p className="text-gray-400">Sign in to see your upcoming episodes.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/50 border border-red-800 text-red-200 px-4 py-2 rounded-lg text-sm">
        {error}
      </div>
    );
  }

  const todayByShow = groupByShow(today);
  const upcomingByDate = new Map<string, Episode[]>();
  for (const ep of upcoming) {
    if (!ep.air_date) continue;
    if (!upcomingByDate.has(ep.air_date)) upcomingByDate.set(ep.air_date, []);
    upcomingByDate.get(ep.air_date)!.push(ep);
  }

  const noEpisodes = today.length === 0 && upcoming.length === 0;

  return (
    <div className="space-y-8">
      {/* Today's Episodes */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">Today</h2>
        {today.length === 0 ? (
          <p className="text-gray-500 text-sm">
            {noEpisodes ? "No upcoming episodes for your tracked shows." : "No episodes airing today."}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from(todayByShow.entries()).map(([titleId, eps]) => (
              <ShowEpisodeGroup
                key={titleId}
                showTitle={eps[0].show_title}
                episodes={eps}
                posterUrl={eps[0].poster_url}
              />
            ))}
          </div>
        )}
      </section>

      {/* Upcoming Episodes */}
      {upcoming.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-300 mb-4">Coming Up</h2>
          <div className="space-y-4">
            {Array.from(upcomingByDate.entries()).map(([date, eps]) => {
              const byShow = groupByShow(eps);
              return (
                <div key={date}>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">{formatUpcomingDate(date)}</h3>
                  <div className="space-y-2">
                    {Array.from(byShow.entries()).map(([titleId, showEps]) => (
                      <ShowEpisodeGroup
                        key={titleId}
                        showTitle={showEps[0].show_title}
                        episodes={showEps}
                        posterUrl={showEps[0].poster_url}
                        compact
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
