import { useState, useEffect, useRef, useCallback, memo } from "react";
import { Link } from "react-router";
import { Maximize2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import * as api from "../api";
import type { Episode, Title } from "../types";
import { normalizeSearchTitle } from "../types";
import TitleList from "../components/TitleList";
import { TitleGridSkeleton } from "../components/SkeletonComponents";
import {
  formatEpisodeCode,
  getUniqueProviders,
  groupByShow,
  formatUpcomingDate,
  WatchedIcon,
  ShowEpisodeGroup,
} from "../components/EpisodeComponents";
import { EpisodeListSkeleton } from "../components/SkeletonComponents";
import HeroBanner from "../components/HeroBanner";

export function groupByShowAndSeason(episodes: Episode[]): Map<string, Map<number, Episode[]>> {
  const map = new Map<string, Map<number, Episode[]>>();
  for (const ep of episodes) {
    if (!map.has(ep.title_id)) map.set(ep.title_id, new Map());
    const seasonMap = map.get(ep.title_id)!;
    if (!seasonMap.has(ep.season_number)) seasonMap.set(ep.season_number, []);
    seasonMap.get(ep.season_number)!.push(ep);
  }
  return map;
}

export const EPISODES_PER_PAGE = 5;

const UnwatchedShowGroup = memo(function UnwatchedShowGroup({ showTitle, seasonNumber, episodes, posterUrl, onToggleWatched, onMarkSeasonWatched }: {
  showTitle: string;
  seasonNumber: number;
  episodes: Episode[];
  posterUrl: string | null;
  onToggleWatched: (id: number, current: boolean) => void;
  onMarkSeasonWatched: (episodeIds: number[]) => void;
}) {
  const [showAllEpisodes, setShowAllEpisodes] = useState(false);
  const { t } = useTranslation();
  const providers = getUniqueProviders(episodes[0]?.offers);
  const visibleEpisodes = showAllEpisodes ? episodes : episodes.slice(0, EPISODES_PER_PAGE);
  const hiddenCount = episodes.length - EPISODES_PER_PAGE;

  return (
    <div className="bg-zinc-900 rounded-xl overflow-hidden">
      <div className="flex gap-4 p-4">
        {posterUrl && (
          <Link to={`/title/${episodes[0].title_id}`} className="flex-shrink-0">
            <img src={posterUrl} alt={showTitle} className="w-16 h-24 rounded-lg object-cover" loading="lazy" />
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <Link to={`/title/${episodes[0].title_id}`} className="hover:text-amber-400 transition-colors">
              <h3 className="font-semibold text-white">{showTitle}</h3>
            </Link>
            {episodes.length > 1 && (
              <button
                onClick={() => onMarkSeasonWatched(episodes.map((ep) => ep.id))}
                className="text-xs text-zinc-400 hover:text-emerald-400 transition-colors flex-shrink-0 cursor-pointer"
              >
                {t("home.markSeasonWatched")}
              </button>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">{t("home.season", { number: seasonNumber })}</p>
          <div className="mt-2 space-y-1">
            {visibleEpisodes.map((ep) => (
              <div key={ep.id} className="flex items-center gap-2 text-sm">
                <WatchedIcon watched={!!ep.is_watched} onClick={() => onToggleWatched(ep.id, !!ep.is_watched)} />
                <Link to={`/title/${ep.title_id}/season/${ep.season_number}/episode/${ep.episode_number}`} className="hover:text-amber-400 transition-colors truncate">
                  <span className="text-amber-400 font-medium">{formatEpisodeCode(ep)}</span>
                  {ep.name && <span className="text-zinc-400"> · {ep.name}</span>}
                </Link>
              </div>
            ))}
          </div>
          {!showAllEpisodes && hiddenCount > 0 && (
            <button
              onClick={() => setShowAllEpisodes(true)}
              className="text-xs text-zinc-400 hover:text-amber-400 transition-colors mt-2 cursor-pointer"
            >
              {t("home.showAll", { count: episodes.length })}
            </button>
          )}
          {showAllEpisodes && episodes.length > EPISODES_PER_PAGE && (
            <button
              onClick={() => setShowAllEpisodes(false)}
              className="text-xs text-zinc-400 hover:text-amber-400 transition-colors mt-2 cursor-pointer"
            >
              {t("home.showLess")}
            </button>
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
});

const UnwatchedShowCard = memo(function UnwatchedShowCard({ titleId, seasonMap, expanded, onToggleExpand, onToggleWatched, onMarkSeasonWatched }: {
  titleId: string;
  seasonMap: Map<number, Episode[]>;
  expanded: boolean;
  onToggleExpand: (titleId: string) => void;
  onToggleWatched: (id: number, current: boolean) => void;
  onMarkSeasonWatched: (episodeIds: number[]) => void;
}) {
  const { t } = useTranslation();
  const sortedSeasons = Array.from(seasonMap.entries()).sort(([a], [b]) => a - b);
  const extraSeasons = sortedSeasons.length - 1;

  if (expanded) {
    return (
      <div className="space-y-3">
        {sortedSeasons.map(([seasonNum, eps]) => (
          <UnwatchedShowGroup
            key={`${titleId}-s${seasonNum}`}
            showTitle={eps[0].show_title}
            seasonNumber={seasonNum}
            episodes={eps}
            posterUrl={eps[0].poster_url}
            onToggleWatched={onToggleWatched}
            onMarkSeasonWatched={onMarkSeasonWatched}
          />
        ))}
        {sortedSeasons.length > 1 && (
          <button
            onClick={() => onToggleExpand(titleId)}
            className="text-xs text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer w-full text-center"
          >
            {t("home.collapseSeasons")}
          </button>
        )}
      </div>
    );
  }

  // Collapsed: show only earliest season with deck effect
  const [seasonNum, eps] = sortedSeasons[0];

  return (
    <div className="relative">
      {/* Shadow cards for deck effect */}
      {extraSeasons >= 2 && (
        <div className="absolute inset-0 translate-y-2 translate-x-2 scale-[0.94] bg-zinc-900 rounded-xl border border-zinc-800/30 opacity-30" />
      )}
      {extraSeasons >= 1 && (
        <div className="absolute inset-0 translate-y-1 translate-x-1 scale-[0.97] bg-zinc-900 rounded-xl border border-zinc-800/30 opacity-60" />
      )}
      {/* Main card */}
      <div className="relative z-10">
        <UnwatchedShowGroup
          showTitle={eps[0].show_title}
          seasonNumber={seasonNum}
          episodes={eps}
          posterUrl={eps[0].poster_url}
          onToggleWatched={onToggleWatched}
          onMarkSeasonWatched={onMarkSeasonWatched}
        />
        {extraSeasons > 0 && (
          <button
            onClick={() => onToggleExpand(titleId)}
            className="w-full text-center text-xs text-zinc-400 hover:text-amber-400 transition-colors py-2 cursor-pointer"
          >
            {t("home.moreSeasons", { count: extraSeasons })}
          </button>
        )}
      </div>
    </div>
  );
});

function UnwatchedCarousel({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollButtons();
    el.addEventListener("scroll", updateScrollButtons, { passive: true });
    const observer = new ResizeObserver(updateScrollButtons);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollButtons);
      observer.disconnect();
    };
  }, [updateScrollButtons]);

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = 320 + 12; // w-80 (320px) + gap-3 (12px)
    el.scrollBy({ left: direction === "left" ? -cardWidth : cardWidth, behavior: "smooth" });
  };

  return (
    <div className="relative group">
      {canScrollLeft && (
        <button
          onClick={() => scroll("left")}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-20 bg-zinc-800/90 hover:bg-zinc-700 text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {children}
      </div>
      {canScrollRight && (
        <button
          onClick={() => scroll("right")}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-20 bg-zinc-800/90 hover:bg-zinc-700 text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const [today, setToday] = useState<Episode[]>([]);
  const [upcoming, setUpcoming] = useState<Episode[]>([]);
  const [unwatched, setUnwatched] = useState<Episode[]>([]);
  const [expandedShows, setExpandedShows] = useState<Set<string>>(new Set());
  const [popularTitles, setPopularTitles] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      api.browseTitles({ category: "popular", page: 1 })
        .then((res) => setPopularTitles(res.titles.map(normalizeSearchTitle)))
        .catch(() => {})
        .finally(() => setLoading(false));
      return;
    }

    async function load() {
      try {
        const data = await api.getUpcomingEpisodes();
        setToday(data.today);
        setUpcoming(data.upcoming);
        setUnwatched(data.unwatched);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, authLoading]);

  const toggleWatched = useCallback(async (episodeId: number, currentlyWatched: boolean) => {
    const updateAll = (eps: Episode[]) =>
      eps.map((ep) => (ep.id === episodeId ? { ...ep, is_watched: !currentlyWatched } : ep));
    const revertAll = (eps: Episode[]) =>
      eps.map((ep) => (ep.id === episodeId ? { ...ep, is_watched: currentlyWatched } : ep));

    setToday((prev) => updateAll(prev));
    setUpcoming((prev) => updateAll(prev));
    setUnwatched((prev) => {
      if (!currentlyWatched) {
        return prev.filter((ep) => ep.id !== episodeId);
      }
      return prev;
    });

    try {
      if (currentlyWatched) {
        await api.unwatchEpisode(episodeId);
      } else {
        await api.watchEpisode(episodeId);
      }
    } catch (err) {
      setToday((prev) => revertAll(prev));
      setUpcoming((prev) => revertAll(prev));
      if (!currentlyWatched) {
        // Re-fetch to restore the removed episode
        try {
          const data = await api.getUpcomingEpisodes();
          setUnwatched(data.unwatched);
        } catch { /* ignore refetch failure */ }
      }
      console.error("Failed to toggle watched:", err);
      toast.error("Failed to update watched status — please try again");
    }
  }, []);

  const markSeasonWatched = useCallback(async (episodeIds: number[]) => {
    const idSet = new Set(episodeIds);
    setUnwatched((prev) => prev.filter((ep) => !idSet.has(ep.id)));

    try {
      await api.watchEpisodesBulk(episodeIds, true);
    } catch (err) {
      // Re-fetch to restore
      try {
        const data = await api.getUpcomingEpisodes();
        setUnwatched(data.unwatched);
      } catch { /* ignore refetch failure */ }
      console.error("Failed to bulk mark watched:", err);
      toast.error("Failed to mark season as watched — please try again");
    }
  }, []);

  const handleToggleExpand = useCallback((titleId: string) => {
    setExpandedShows((prev) => {
      const next = new Set(prev);
      if (next.has(titleId)) next.delete(titleId);
      else next.add(titleId);
      return next;
    });
  }, []);

  if (authLoading || loading) {
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">{t("landing.popularNow")}</h2>
            <Link to="/browse" className="text-sm text-amber-400 hover:text-amber-300 transition-colors">
              {t("landing.discoverMore")} →
            </Link>
          </div>
          {loading ? (
            <TitleGridSkeleton count={12} />
          ) : (
            <TitleList titles={popularTitles.slice(0, 12)} />
          )}
        </section>
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
  const unwatchedByShowAndSeason = groupByShowAndSeason(unwatched);

  const noEpisodes = today.length === 0 && upcoming.length === 0 && unwatched.length === 0;

  return (
    <div className="space-y-8">
      {/* Hero Banner (desktop only) */}
      {unwatched.length > 0 && <HeroBanner episodes={unwatched} />}

      {/* Unwatched Episodes */}
      {unwatched.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-bold text-white">{t("home.unwatched")}</h2>
            <Link
              to="/reels"
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-amber-400 transition-colors"
              title="Full-screen reels view"
            >
              <Maximize2 size={14} />
              {t("home.reels")}
            </Link>
          </div>
          <UnwatchedCarousel>
            {Array.from(unwatchedByShowAndSeason.entries()).map(([titleId, seasonMap]) => (
              <div key={titleId} className="w-80 flex-shrink-0" style={{ scrollSnapAlign: "start" }}>
                <UnwatchedShowCard
                  titleId={titleId}
                  seasonMap={seasonMap}
                  expanded={expandedShows.has(titleId)}
                  onToggleExpand={handleToggleExpand}
                  onToggleWatched={toggleWatched}
                  onMarkSeasonWatched={markSeasonWatched}
                />
              </div>
            ))}
          </UnwatchedCarousel>
        </section>
      )}

      {/* Today's Episodes */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">{t("home.today")}</h2>
        {today.length === 0 ? (
          <p className="text-zinc-500 text-sm">
            {noEpisodes ? t("home.noEpisodes") : t("home.noEpisodesToday")}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from(todayByShow.entries()).map(([titleId, eps]) => (
              <ShowEpisodeGroup
                key={titleId}
                showTitle={eps[0].show_title}
                episodes={eps}
                posterUrl={eps[0].poster_url}
                onToggleWatched={toggleWatched}
              />
            ))}
          </div>
        )}
      </section>

      {/* Upcoming Episodes */}
      {upcoming.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-zinc-300 mb-4">{t("home.comingUp")}</h2>
          <div className="space-y-4">
            {Array.from(upcomingByDate.entries()).map(([date, eps]) => {
              const byShow = groupByShow(eps);
              const dateLabel = formatUpcomingDate(date);
              return (
                <div key={date}>
                  <h3 className="text-sm font-medium text-zinc-500 mb-2">{dateLabel === "__TOMORROW__" ? t("episodes.tomorrow") : dateLabel}</h3>
                  <div className="space-y-2">
                    {Array.from(byShow.entries()).map(([titleId, showEps]) => (
                      <ShowEpisodeGroup
                        key={titleId}
                        showTitle={showEps[0].show_title}
                        episodes={showEps}
                        posterUrl={showEps[0].poster_url}
                        compact
                        onToggleWatched={toggleWatched}
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
