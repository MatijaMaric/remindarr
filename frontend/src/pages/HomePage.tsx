import { useState, useEffect, useMemo, useRef, useCallback, useReducer } from "react";
import { Card } from "../components/ui/card";
import { Link } from "react-router";
import { Maximize2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useIsMobile } from "../hooks/useIsMobile";
import * as api from "../api";
import type { Episode, Title, Recommendation, HomepageSection } from "../types";
import { normalizeSearchTitle, DEFAULT_HOMEPAGE_LAYOUT } from "../types";
import TitleList from "../components/TitleList";
import { EpisodeListSkeleton } from "../components/SkeletonComponents";
import { groupByShow, formatUpcomingDate } from "../components/EpisodeComponents";
import { EpisodeShowCard, DeckCardWrapper } from "../components/EpisodeShowCard";
import EpisodeCountdown from "../components/EpisodeCountdown";
import HeroBanner from "../components/HeroBanner";
import FullBleedCarousel from "../components/FullBleedCarousel";
import { Kicker } from "../components/design";
import { posterUrl } from "../lib/tmdb-images";

export interface UnwatchedCardEntry {
  episode: Episode;
  totalEpisodeCount: number;
  allEpisodeIds: number[];
  showTitle: string;
  titleId: string;
}

export function buildUnwatchedCards(episodes: Episode[]): UnwatchedCardEntry[] {
  const showMap = new Map<string, Episode[]>();
  for (const ep of episodes) {
    if (!showMap.has(ep.title_id)) showMap.set(ep.title_id, []);
    showMap.get(ep.title_id)!.push(ep);
  }

  const entries: UnwatchedCardEntry[] = [];
  for (const [titleId, eps] of showMap) {
    // Sort episodes: lowest season first, then lowest episode number
    const sorted = [...eps].sort((a, b) =>
      a.season_number !== b.season_number
        ? a.season_number - b.season_number
        : a.episode_number - b.episode_number
    );
    const firstEpisode = sorted[0];
    const allIds = sorted.map((e) => e.id);

    // Find most recent air_date across all episodes for ordering
    let mostRecentDate = "";
    for (const ep of eps) {
      if (ep.air_date && ep.air_date > mostRecentDate) mostRecentDate = ep.air_date;
    }

    entries.push({
      episode: firstEpisode,
      totalEpisodeCount: eps.length,
      allEpisodeIds: allIds,
      showTitle: firstEpisode.show_title,
      titleId,
    });
  }

  // Sort by most recent air_date descending
  entries.sort((a, b) => {
    const aDate = a.allEpisodeIds.reduce((best, id) => {
      const ep = episodes.find((e) => e.id === id);
      return ep?.air_date && ep.air_date > best ? ep.air_date : best;
    }, "");
    const bDate = b.allEpisodeIds.reduce((best, id) => {
      const ep = episodes.find((e) => e.id === id);
      return ep?.air_date && ep.air_date > best ? ep.air_date : best;
    }, "");
    return bDate.localeCompare(aDate);
  });

  return entries;
}

type HomeState =
  | { status: "loading" }
  | { status: "anon"; popularTitles: Title[] }
  | { status: "auth"; today: Episode[]; upcoming: Episode[]; unwatched: Episode[]; recommendations: Recommendation[]; layout: HomepageSection[] }
  | { status: "error"; message: string };

type HomeAction =
  | { type: "LOAD_ANON_SUCCESS"; popularTitles: Title[] }
  | { type: "LOAD_AUTH_SUCCESS"; today: Episode[]; upcoming: Episode[]; unwatched: Episode[]; recommendations: Recommendation[]; layout: HomepageSection[] }
  | { type: "LOAD_ERROR"; message: string }
  | { type: "TOGGLE_WATCHED"; episodeId: number; currentlyWatched: boolean }
  | { type: "TOGGLE_WATCHED_REVERT"; episodeId: number; currentlyWatched: boolean }
  | { type: "REPLACE_UNWATCHED"; unwatched: Episode[] }
  | { type: "MARK_ALL_WATCHED"; episodeIds: number[] };

function homeReducer(state: HomeState, action: HomeAction): HomeState {
  switch (action.type) {
    case "LOAD_ANON_SUCCESS":
      return { status: "anon", popularTitles: action.popularTitles };
    case "LOAD_AUTH_SUCCESS":
      return { status: "auth", today: action.today, upcoming: action.upcoming, unwatched: action.unwatched, recommendations: action.recommendations, layout: action.layout };
    case "LOAD_ERROR":
      return { status: "error", message: action.message };
    case "TOGGLE_WATCHED": {
      if (state.status !== "auth") return state;
      const update = (ep: Episode) => ep.id === action.episodeId ? { ...ep, is_watched: !action.currentlyWatched } : ep;
      return {
        ...state,
        today: state.today.map(update),
        upcoming: state.upcoming.map(update),
        unwatched: !action.currentlyWatched
          ? state.unwatched.filter((ep) => ep.id !== action.episodeId)
          : state.unwatched,
      };
    }
    case "TOGGLE_WATCHED_REVERT": {
      if (state.status !== "auth") return state;
      const revert = (ep: Episode) => ep.id === action.episodeId ? { ...ep, is_watched: action.currentlyWatched } : ep;
      return { ...state, today: state.today.map(revert), upcoming: state.upcoming.map(revert) };
    }
    case "REPLACE_UNWATCHED":
      if (state.status !== "auth") return state;
      return { ...state, unwatched: action.unwatched };
    case "MARK_ALL_WATCHED": {
      if (state.status !== "auth") return state;
      const idSet = new Set(action.episodeIds);
      return { ...state, unwatched: state.unwatched.filter((ep) => !idSet.has(ep.id)) };
    }
    default:
      return state;
  }
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function MobileFeedHome({
  user,
  today,
  upcoming,
  unwatched,
}: {
  user: NonNullable<ReturnType<typeof useAuth>["user"]>;
  today: Episode[];
  upcoming: Episode[];
  unwatched: Episode[];
}) {
  const tonightEp = today[0] ?? null;
  const alsoAiring = today.slice(1);

  // Group unwatched by show, take up to 8 shows
  const cwByShow = new Map<string, Episode[]>();
  for (const ep of unwatched) {
    if (!cwByShow.has(ep.title_id)) cwByShow.set(ep.title_id, []);
    cwByShow.get(ep.title_id)!.push(ep);
  }
  const cwEntries = Array.from(cwByShow.entries()).slice(0, 8);

  const today7 = upcoming.slice(0, 18);
  const posterUrl = tonightEp?.poster_url ?? null;

  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="pb-28 -mx-4">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-3 pb-0">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500 mb-1">{dateLabel}</div>
          <div className="text-[22px] font-bold tracking-[-0.6px]">
            {getGreeting()}, <span className="text-amber-400">{user.display_name?.split(" ")[0] ?? user.username}</span>
          </div>
        </div>
        <Link to="/browse" className="w-[38px] h-[38px] rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-zinc-400 text-base shrink-0">
          ⌕
        </Link>
      </div>

      {/* Feed/Reels mode switcher */}
      <div className="flex items-center gap-2 px-5 pt-4 pb-1">
        <span className="px-3 py-1.5 rounded-full bg-white/[0.15] backdrop-blur border border-white/[0.2] text-[12px] font-bold text-white">Feed</span>
        <Link to="/reels" className="px-3 py-1.5 rounded-full text-[12px] font-bold text-white/55 border border-transparent">Reels</Link>
      </div>

      {/* Tonight hero card */}
      {tonightEp && (
        <div className="px-5 pt-4 pb-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500 mb-2">
            Tonight · {today.length} airing
          </div>
          <Link to={`/title/${tonightEp.title_id}`}>
            <div className="rounded-[20px] overflow-hidden relative border border-amber-400/[0.25]" style={{ height: 360 }}>
              {posterUrl ? (
                <img src={posterUrl} alt={tonightEp.show_title} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-b from-zinc-800 to-zinc-950" />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black/90" />
              {/* Chips */}
              <div className="absolute top-3 left-3 flex gap-1.5">
                <span className="bg-amber-400 text-black text-[10px] font-bold font-mono px-2.5 py-1 rounded-full">
                  S{String(tonightEp.season_number).padStart(2,"0")}·E{String(tonightEp.episode_number).padStart(2,"0")}
                </span>
                {tonightEp.offers?.[0] && (
                  <span className="bg-white/[0.12] text-white text-[10px] font-semibold font-mono px-2.5 py-1 rounded-full border border-white/[0.1]">
                    {tonightEp.offers[0].provider_name.toUpperCase()}
                  </span>
                )}
              </div>
              {/* Bottom content */}
              <div className="absolute bottom-0 left-0 right-0 p-[18px]">
                <div className="font-mono text-[11px] text-amber-400 uppercase tracking-[0.15em] font-bold mb-1.5">
                  {tonightEp.show_title}
                </div>
                <div className="text-[28px] font-extrabold tracking-[-0.8px] leading-[1.05] mb-2">
                  {tonightEp.name ?? `Episode ${tonightEp.episode_number}`}
                </div>
                {tonightEp.overview && (
                  <div className="text-[13px] text-zinc-300 line-clamp-2 mb-3">{tonightEp.overview}</div>
                )}
                <div className="flex gap-2">
                  <div className="flex-1 bg-amber-400 text-black text-center py-3 rounded-[10px] font-bold text-[14px]">▶  Play</div>
                </div>
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* Also airing */}
      {alsoAiring.length > 0 && (
        <>
          <div className="flex items-baseline justify-between px-5 pt-5 pb-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500 mb-1">{alsoAiring.length} more today</div>
              <div className="text-[22px] font-bold tracking-[-0.6px]">Also airing</div>
            </div>
          </div>
          <div className="px-5 flex flex-col gap-2.5">
            {alsoAiring.slice(0, 4).map((ep) => (
              <Link key={ep.id} to={`/title/${ep.title_id}/season/${ep.season_number}/episode/${ep.episode_number}`}>
                <Card padding="sm" className="flex gap-3 items-center rounded-[14px]">
                  <div className="w-[54px] h-[72px] rounded-lg overflow-hidden shrink-0 bg-zinc-800">
                    {ep.poster_url && <img src={ep.poster_url} alt="" className="w-full h-full object-cover" loading="lazy" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold truncate mb-0.5">{ep.show_title}</div>
                    <div className="font-mono text-[11px] text-zinc-500 mb-1">
                      S{String(ep.season_number).padStart(2,"0")}·E{String(ep.episode_number).padStart(2,"0")}{ep.name ? ` · ${ep.name}` : ""}
                    </div>
                    <div className="font-mono text-[11px] text-amber-400">
                      {ep.air_date ?? ""}{ep.offers?.[0] ? ` · ${ep.offers[0].provider_name}` : ""}
                    </div>
                  </div>
                  <span className="text-zinc-500 text-base">›</span>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Continue watching */}
      {cwEntries.length > 0 && (
        <>
          <div className="flex items-baseline justify-between px-5 pt-5 pb-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500 mb-1">
                {cwByShow.size} show{cwByShow.size !== 1 ? "s" : ""} · {unwatched.length} unwatched
              </div>
              <div className="text-[22px] font-bold tracking-[-0.6px]">Continue watching</div>
            </div>
            <Link to="/reels" className="font-mono text-[12px] text-amber-400 font-semibold">See all →</Link>
          </div>
          <div className="flex gap-3 px-5 overflow-x-auto scrollbar-none pb-1">
            {cwEntries.map(([titleId, eps]) => {
              const ep = eps[0];
              const pUrl = ep.poster_url;
              return (
                <Link key={titleId} to={`/title/${titleId}`} className="w-[132px] shrink-0">
                  <div className="aspect-[2/3] rounded-[10px] overflow-hidden relative mb-2 bg-zinc-800">
                    {pUrl && <img src={pUrl} alt="" className="w-full h-full object-cover" loading="lazy" />}
                    {/* Progress bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/40">
                      <div className="h-full bg-amber-400" style={{ width: `${ep.total_episodes ? Math.round((ep.watched_episodes_count ?? 0) / ep.total_episodes * 100) : 0}%` }} />
                    </div>
                    {/* Unwatched badge */}
                    <div className="absolute top-1.5 right-1.5 bg-black/70 text-amber-400 text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full">
                      +{eps.length}
                    </div>
                  </div>
                  <div className="text-[12px] font-medium leading-[1.2] truncate mb-0.5">{ep.show_title}</div>
                  <div className="font-mono text-[10px] text-zinc-500">
                    E{ep.episode_number}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {/* This week */}
      {today7.length > 0 && (
        <>
          <div className="flex items-baseline justify-between px-5 pt-5 pb-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500 mb-1">
                {today7.length} episodes
              </div>
              <div className="text-[22px] font-bold tracking-[-0.6px]">This week</div>
            </div>
            <Link to="/calendar" className="font-mono text-[12px] text-amber-400 font-semibold">Calendar →</Link>
          </div>
          <div className="px-5 grid grid-cols-3 gap-2.5">
            {today7.map((ep) => (
              <Link key={ep.id} to={`/title/${ep.title_id}`}>
                <div className="aspect-[2/3] rounded-lg overflow-hidden mb-1.5 bg-zinc-800">
                  {ep.poster_url && <img src={ep.poster_url} alt="" className="w-full h-full object-cover" loading="lazy" />}
                </div>
                <div className="text-[11px] font-medium leading-[1.15] truncate">{ep.show_title}</div>
                <div className="font-mono text-[9px] text-zinc-500 uppercase tracking-[0.3px]">
                  {ep.air_date ? ep.air_date.slice(5) : ""}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(homeReducer, { status: "loading" });
  const [confirmingTitleId, setConfirmingTitleId] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (authLoading) return;
    const controller = new AbortController();
    const { signal } = controller;

    if (!user) {
      api.browseTitles({ category: "popular", page: 1 }, signal)
        .then((res) => { if (!signal.aborted) dispatch({ type: "LOAD_ANON_SUCCESS", popularTitles: res.titles.map(normalizeSearchTitle) }); })
        .catch(() => { if (!signal.aborted) dispatch({ type: "LOAD_ANON_SUCCESS", popularTitles: [] }); });
      return () => controller.abort();
    }

    async function load() {
      try {
        const [episodeData, recData, layoutData] = await Promise.all([
          api.getUpcomingEpisodes(signal),
          api.getRecommendations(6, undefined, signal).catch(() => ({ recommendations: [], count: 0 })),
          (api.getHomepageLayout?.(signal) ?? Promise.resolve({ homepage_layout: DEFAULT_HOMEPAGE_LAYOUT })).catch(() => ({ homepage_layout: DEFAULT_HOMEPAGE_LAYOUT })),
        ]);
        if (signal.aborted) return;
        dispatch({ type: "LOAD_AUTH_SUCCESS", today: episodeData.today, upcoming: episodeData.upcoming, unwatched: episodeData.unwatched, recommendations: recData.recommendations, layout: layoutData.homepage_layout });
      } catch (err: unknown) {
        if (!signal.aborted) dispatch({ type: "LOAD_ERROR", message: err instanceof Error ? err.message : String(err) });
      }
    }
    load();
    return () => controller.abort();
  }, [user, authLoading]);

  // Cleanup confirmation timer
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const toggleWatched = useCallback(async (episodeId: number, currentlyWatched: boolean) => {
    dispatch({ type: "TOGGLE_WATCHED", episodeId, currentlyWatched });
    try {
      if (currentlyWatched) {
        await api.unwatchEpisode(episodeId);
      } else {
        await api.watchEpisode(episodeId);
      }
    } catch (err) {
      dispatch({ type: "TOGGLE_WATCHED_REVERT", episodeId, currentlyWatched });
      if (!currentlyWatched) {
        try {
          const data = await api.getUpcomingEpisodes();
          dispatch({ type: "REPLACE_UNWATCHED", unwatched: data.unwatched });
        } catch { /* ignore refetch failure */ }
      }
      console.error("Failed to toggle watched:", err);
      toast.error("Failed to update watched status — please try again");
    }
  }, []);

  const markAllWatched = useCallback(async (episodeIds: number[]) => {
    dispatch({ type: "MARK_ALL_WATCHED", episodeIds });
    try {
      await api.watchEpisodesBulk(episodeIds, true);
    } catch (err) {
      try {
        const data = await api.getUpcomingEpisodes();
        dispatch({ type: "REPLACE_UNWATCHED", unwatched: data.unwatched });
      } catch { /* ignore refetch failure */ }
      console.error("Failed to bulk mark watched:", err);
      toast.error("Failed to mark episodes as watched — please try again");
    }
  }, []);

  const handleMarkAllWatched = useCallback((titleId: string, episodeIds: number[]) => {
    if (confirmingTitleId === titleId) {
      // Second click — execute
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirmingTitleId(null);
      markAllWatched(episodeIds);
    } else {
      // First click — enter confirmation
      setConfirmingTitleId(titleId);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setConfirmingTitleId(null), 3000);
    }
  }, [confirmingTitleId, markAllWatched]);

  // Derived data from reducer state — wrapped in useMemo so downstream deps
  // get stable array references when state.status !== "auth".
  const { today, upcoming, unwatched, recommendations, layout } = useMemo(() => {
    if (state.status === "auth") {
      return { today: state.today, upcoming: state.upcoming, unwatched: state.unwatched, recommendations: state.recommendations, layout: state.layout };
    }
    return { today: [] as Episode[], upcoming: [] as Episode[], unwatched: [] as Episode[], recommendations: [] as Recommendation[], layout: DEFAULT_HOMEPAGE_LAYOUT };
  }, [state]);

  // Stable slice for the unauthenticated landing page so TitleList sees the
  // same array reference on unrelated re-renders.
  const popularTitlesPreview = useMemo(
    () => state.status === "anon" ? state.popularTitles.slice(0, 12) : [],
    [state]
  );

  const unwatchedCards = useMemo(() => buildUnwatchedCards(unwatched), [unwatched]);

  // Group upcoming episodes by air_date — pre-iterating array of N entries
  // every render gets wasteful when state like `confirmingTitleId` flips below.
  // Also pre-group each day by show so the FullBleedCarousel children don't
  // have to recompute groupByShow on every parent render.
  const upcomingByDateEntries = useMemo(() => {
    const map = new Map<string, Episode[]>();
    for (const ep of upcoming) {
      if (!ep.air_date) continue;
      if (!map.has(ep.air_date)) map.set(ep.air_date, []);
      map.get(ep.air_date)!.push(ep);
    }
    return Array.from(map.entries()).map(([date, eps]) => ({
      date,
      dateLabel: formatUpcomingDate(date),
      byShow: Array.from(groupByShow(eps).entries()),
    }));
  }, [upcoming]);

  // Pre-group today's episodes by show — same reasoning as above.
  const todayByShowEntries = useMemo(
    () => Array.from(groupByShow(today).entries()),
    [today]
  );

  // For "Airing Soon": one card per show, earliest upcoming episode, sorted by air_date.
  const airingEntries = useMemo(() => {
    const byShow = new Map<string, Episode>();
    for (const ep of upcoming) {
      if (!ep.air_date) continue;
      const existing = byShow.get(ep.title_id);
      if (!existing || ep.air_date < existing.air_date!) {
        byShow.set(ep.title_id, ep);
      }
    }
    return Array.from(byShow.values()).sort((a, b) => {
      if (!a.air_date && !b.air_date) return 0;
      if (!a.air_date) return 1;
      if (!b.air_date) return -1;
      return a.air_date.localeCompare(b.air_date);
    });
  }, [upcoming]);

  if (authLoading || state.status === "loading") {
    return <EpisodeListSkeleton />;
  }

  if (!user) {
    return (
      <div className="space-y-10">
        {/* Hero */}
        <div className="text-center py-12">
          <h1 className="text-4xl font-extrabold text-white mb-3">{t("landing.tagline")}</h1>
          <p className="text-zinc-400 text-lg max-w-xl mx-auto mb-8">{t("landing.subtitle")}</p>
          <div className="flex justify-center gap-4">
            <Link
              to="/login"
              className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-colors"
            >
              {t("landing.signIn")}
            </Link>
            <Link
              to="/signup"
              className="px-6 py-2.5 border border-zinc-600 hover:border-zinc-400 text-white font-semibold rounded-lg transition-colors"
            >
              {t("landing.signUp")}
            </Link>
          </div>
        </div>

        {/* Popular titles */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <Kicker>Browse</Kicker>
              <h2 className="text-xl font-bold tracking-[-0.01em]">{t("landing.popularNow")}</h2>
            </div>
            <Link to="/browse" className="font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors">
              {t("landing.discoverMore")} →
            </Link>
          </div>
          <TitleList titles={popularTitlesPreview} />
        </section>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="bg-red-900/50 border border-red-800 text-red-200 px-4 py-2 rounded-lg text-sm">
        {state.message}
      </div>
    );
  }

  if (isMobile && user) {
    return <MobileFeedHome user={user} today={today} upcoming={upcoming} unwatched={unwatched} />;
  }

  const noEpisodes = today.length === 0 && upcoming.length === 0 && unwatched.length === 0;

  function renderSection(sectionId: string) {
    switch (sectionId) {
      case "unwatched":
        return unwatched.length > 0 ? (
          <>
            <div className="-mt-6">
              <HeroBanner episodes={unwatched} onToggleWatched={toggleWatched} />
            </div>
            <section key="unwatched">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <Kicker>Up next</Kicker>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold tracking-[-0.01em]">{t("home.unwatched")}</h2>
                    <Link
                      to="/reels"
                      className="flex items-center gap-1 text-xs text-zinc-400 hover:text-amber-400 transition-colors sm:hidden"
                      title="Full-screen reels view"
                    >
                      <Maximize2 size={14} />
                      {t("home.reels")}
                    </Link>
                  </div>
                </div>
                <Link to="/upcoming" className="font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors">{t("home.seeAll")} →</Link>
              </div>
              <FullBleedCarousel>
                {unwatchedCards.map((card) => (
                  <div key={card.titleId} className="w-80 flex-shrink-0" style={{ scrollSnapAlign: "start" }}>
                    <DeckCardWrapper episodeCount={card.totalEpisodeCount}>
                      <EpisodeShowCard
                        episode={card.episode}
                        episodeCount={card.totalEpisodeCount}
                        showActions
                        allEpisodeIds={card.allEpisodeIds}
                        onToggleWatched={toggleWatched}
                        onMarkAllWatched={(ids) => handleMarkAllWatched(card.titleId, ids)}
                        isConfirming={confirmingTitleId === card.titleId}
                      />
                    </DeckCardWrapper>
                  </div>
                ))}
              </FullBleedCarousel>
            </section>
          </>
        ) : null;

      case "recommendations":
        return recommendations.length > 0 ? (
          <section key="recommendations">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <Kicker>From friends</Kicker>
                <h2 className="text-xl font-bold tracking-[-0.01em]">{t("home.recommendedForYou")}</h2>
              </div>
              <Link to="/discovery" className="font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors">
                {t("home.seeAll")} →
              </Link>
            </div>
            <FullBleedCarousel>
              {recommendations.map((rec) => {
                const posterSrc = posterUrl(rec.title.poster_url, "w185");
                const isUnread = !rec.read_at;
                return (
                  <Link
                    key={rec.id}
                    to={`/title/${rec.title.id}`}
                    className="w-32 flex-shrink-0 group"
                    style={{ scrollSnapAlign: "start" }}
                  >
                    <div className={`relative aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800 ${isUnread ? "ring-2 ring-amber-500/60" : ""}`}>
                      {posterSrc ? (
                        <img
                          src={posterSrc}
                          alt={rec.title.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          loading="lazy"
                          width={185}
                          height={278}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
                          N/A
                        </div>
                      )}
                      {isUnread && (
                        <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500" />
                      )}
                    </div>
                    <p className="text-sm text-white mt-1.5 line-clamp-2 group-hover:text-amber-400 transition-colors">
                      {rec.title.title}
                    </p>
                    <p className="text-xs text-zinc-400 truncate">
                      from @{rec.from_user.username}
                    </p>
                  </Link>
                );
              })}
            </FullBleedCarousel>
          </section>
        ) : null;

      case "today":
        return (
          <section key="today">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <Kicker>Airing tonight</Kicker>
                <h2 className="text-xl font-bold tracking-[-0.01em]">{t("home.today")}</h2>
              </div>
              <Link to="/calendar" className="font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors">{t("home.seeAll")} →</Link>
            </div>
            {today.length === 0 ? (
              <p className="text-zinc-500 text-sm">
                {noEpisodes ? t("home.noEpisodes") : t("home.noEpisodesToday")}
              </p>
            ) : (
              <FullBleedCarousel>
                {todayByShowEntries.map(([titleId, eps]) => (
                  <div key={titleId} className="w-80 flex-shrink-0" style={{ scrollSnapAlign: "start" }}>
                    <DeckCardWrapper episodeCount={eps.length}>
                      <EpisodeShowCard
                        episode={eps[0]}
                        episodeCount={eps.length}
                      />
                    </DeckCardWrapper>
                  </div>
                ))}
              </FullBleedCarousel>
            )}
          </section>
        );

      case "upcoming":
        return upcoming.length > 0 ? (
          <section key="upcoming">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <Kicker>This week</Kicker>
                <h2 className="text-xl font-bold tracking-[-0.01em]">{t("home.comingUp")}</h2>
              </div>
              <Link to="/calendar" className="font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors">Open calendar →</Link>
            </div>
            <div className="space-y-4">
              {upcomingByDateEntries.map(({ date, dateLabel, byShow }) => (
                <div key={date}>
                  <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-500 mb-2">{dateLabel === "__TOMORROW__" ? t("episodes.tomorrow") : dateLabel}</h3>
                  <FullBleedCarousel>
                    {byShow.map(([titleId, showEps]) => (
                      <div key={titleId} className="w-80 flex-shrink-0" style={{ scrollSnapAlign: "start" }}>
                        <DeckCardWrapper episodeCount={showEps.length}>
                          <EpisodeShowCard
                            episode={showEps[0]}
                            episodeCount={showEps.length}
                          />
                        </DeckCardWrapper>
                      </div>
                    ))}
                  </FullBleedCarousel>
                </div>
              ))}
            </div>
          </section>
        ) : null;

      case "airing_soon":
        return airingEntries.length > 0 ? (
          <section key="airing_soon">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <Kicker>Coming up</Kicker>
                <h2 className="text-xl font-bold tracking-[-0.01em]">{t("home.airingSoon.title")}</h2>
              </div>
              <Link to="/calendar" className="font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors">Open calendar →</Link>
            </div>
            <FullBleedCarousel>
              {airingEntries.map((ep) => (
                <div key={ep.id} className="w-80 flex-shrink-0 relative" style={{ scrollSnapAlign: "start" }}>
                  <DeckCardWrapper episodeCount={1}>
                    <EpisodeShowCard episode={ep} episodeCount={1} />
                  </DeckCardWrapper>
                  {ep.air_date && (
                    <div className="absolute bottom-4 left-3 z-10">
                      <EpisodeCountdown airDate={ep.air_date} />
                    </div>
                  )}
                </div>
              ))}
            </FullBleedCarousel>
          </section>
        ) : (
          <section key="airing_soon">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <Kicker>Coming up</Kicker>
                <h2 className="text-xl font-bold tracking-[-0.01em]">{t("home.airingSoon.title")}</h2>
              </div>
            </div>
            <p className="text-zinc-500 text-sm">{t("home.airingSoon.empty")}</p>
          </section>
        );

      default:
        return null;
    }
  }

  return (
    <div className="space-y-8">
      {layout
        .filter((s) => s.enabled)
        .map((s) => renderSection(s.id))}
    </div>
  );
}
