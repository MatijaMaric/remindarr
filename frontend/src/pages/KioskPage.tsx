import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router";
import * as api from "../api";
import type { KioskData, WatchingTitle } from "../api";
import type { Episode, Title } from "../types";
import { useApiCall } from "../hooks/useApiCall";
import { EpisodeShowCard, DeckCardWrapper } from "../components/EpisodeShowCard";
import { groupByShow, formatUpcomingDate, formatEpisodeCode } from "../components/EpisodeComponents";

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

function useLiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function groupByDate(episodes: Episode[]): Map<string, Episode[]> {
  const map = new Map<string, Episode[]>();
  for (const ep of episodes) {
    const key = ep.air_date ?? "unknown";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ep);
  }
  return map;
}

function PosterCard({ title }: { title: Title }) {
  const posterUrl = title.poster_url
    ? `https://image.tmdb.org/t/p/w342${title.poster_url.startsWith("/") ? title.poster_url : `/${title.poster_url}`}`
    : null;
  const raw = title.poster_url ?? "";
  const finalUrl = raw.startsWith("http") ? raw : posterUrl;

  return (
    <div className="flex-none w-28 sm:w-36">
      <div className="rounded-lg overflow-hidden bg-zinc-800 aspect-[2/3]">
        {finalUrl ? (
          <img src={finalUrl} alt={title.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs text-center px-2">{title.title}</div>
        )}
      </div>
      <p className="text-xs text-zinc-300 mt-1.5 line-clamp-2 leading-tight">{title.title}</p>
      {title.release_year && <p className="text-[11px] text-zinc-500">{title.release_year}</p>}
    </div>
  );
}

function WatchingCard({ title }: { title: WatchingTitle }) {
  const posterUrl = title.poster_url
    ? `https://image.tmdb.org/t/p/w185${title.poster_url.startsWith("/") ? title.poster_url : `/${title.poster_url}`}`
    : null;
  const raw = title.poster_url ?? "";
  const finalUrl = raw.startsWith("http") ? raw : posterUrl;
  const watched = title.watched_episodes_count ?? 0;
  const released = title.released_episodes_count ?? 0;
  const pct = released > 0 ? Math.round((watched / released) * 100) : 0;

  return (
    <div className="flex items-start gap-3 bg-zinc-900 rounded-xl p-3">
      <div className="flex-none w-14 rounded-lg overflow-hidden bg-zinc-800 aspect-[2/3]">
        {finalUrl ? (
          <img src={finalUrl} alt={title.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-zinc-800" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white text-sm truncate">{title.title}</p>
        <p className="text-xs text-zinc-400 mt-0.5">{watched} / {released} eps watched</p>
        <div className="mt-2 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
          <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        {title.next_episode_air_date && (
          <p className="text-[11px] text-zinc-500 mt-1.5">Next: {formatUpcomingDate(title.next_episode_air_date).replace("__TOMORROW__", "Tomorrow")}</p>
        )}
      </div>
    </div>
  );
}

function TonightSection({ episodes }: { episodes: Episode[] }) {
  const byShow = groupByShow(episodes);
  if (byShow.size === 0) {
    return <p className="text-zinc-500 text-sm">Nothing airing tonight.</p>;
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {Array.from(byShow.entries()).map(([titleId, eps]) => (
        <DeckCardWrapper key={titleId} episodeCount={eps.length}>
          <EpisodeShowCard episode={eps[0]} episodeCount={eps.length} showActions={false} />
        </DeckCardWrapper>
      ))}
    </div>
  );
}

function WeekSection({ episodes }: { episodes: Episode[] }) {
  const byDate = groupByDate(episodes);
  if (byDate.size === 0) {
    return <p className="text-zinc-500 text-sm">No episodes this week.</p>;
  }
  return (
    <div className="space-y-4">
      {Array.from(byDate.entries()).map(([date, eps]) => {
        const byShow = groupByShow(eps);
        const label = formatUpcomingDate(date).replace("__TOMORROW__", "Tomorrow");
        return (
          <div key={date}>
            <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">{label}</p>
            <div className="flex flex-wrap gap-2">
              {Array.from(byShow.entries()).map(([titleId, showEps]) => (
                <div key={titleId} className="bg-zinc-900 rounded-lg px-3 py-2 text-sm">
                  <span className="text-white font-medium">{showEps[0].show_title}</span>
                  <span className="text-zinc-400 ml-2 text-xs">
                    {showEps.map(ep => formatEpisodeCode(ep)).join(", ")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecentSection({ titles }: { titles: Title[] }) {
  if (titles.length === 0) {
    return <p className="text-zinc-500 text-sm">No recent releases.</p>;
  }
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
      {titles.map((t) => <PosterCard key={t.id} title={t} />)}
    </div>
  );
}

function WatchingSection({ titles }: { titles: WatchingTitle[] }) {
  if (titles.length === 0) {
    return <p className="text-zinc-500 text-sm">Nothing in progress.</p>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {titles.map((t) => <WatchingCard key={t.id} title={t} />)}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
      <span className="w-1 h-5 bg-amber-400 rounded-full inline-block" />
      {title}
    </h2>
  );
}

export default function KioskPage() {
  const { token } = useParams<{ token: string }>();
  const now = useLiveClock();

  const fetcher = useCallback(() => api.getKioskData(token!), [token]);
  const { data, error, refetch } = useApiCall(fetcher, [token]);

  useEffect(() => {
    const id = setInterval(refetch, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refetch]);

  if (error) {
    return (
      <div className="h-[100dvh] bg-zinc-950 flex items-center justify-center">
        <div className="text-center max-w-sm px-4">
          <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-red-400 text-2xl">!</span>
          </div>
          <h1 className="text-white text-xl font-bold mb-2">Kiosk unavailable</h1>
          <p className="text-zinc-400 text-sm">This kiosk link is no longer valid. Ask the owner to share a new one.</p>
        </div>
      </div>
    );
  }

  const d: KioskData = data ?? { tonight: [], week: [], recent: [], watching: [] };

  return (
    <div className="h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-none px-5 py-3 border-b border-white/[0.06] flex items-center justify-between bg-zinc-900/50">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md bg-amber-400 flex items-center justify-center font-extrabold text-sm text-black leading-none select-none">R</div>
          <span className="text-base font-bold text-white tracking-tight hidden sm:inline">Remindarr</span>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-white tabular-nums">{formatTime(now)}</p>
          <p className="text-xs text-zinc-400">{formatDate(now)}</p>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-8">
        {/* Tonight */}
        <section>
          <SectionHeader title="Tonight" />
          <TonightSection episodes={d.tonight} />
        </section>

        {/* This week */}
        <section>
          <SectionHeader title="This Week" />
          <WeekSection episodes={d.week} />
        </section>

        {/* Latest releases */}
        <section>
          <SectionHeader title="Latest Releases" />
          <RecentSection titles={d.recent} />
        </section>

        {/* Currently watching */}
        <section>
          <SectionHeader title="Currently Watching" />
          <WatchingSection titles={d.watching} />
        </section>
      </div>
    </div>
  );
}
