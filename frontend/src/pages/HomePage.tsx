import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router";
import { Maximize2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import * as api from "../api";
import type { Episode, Title } from "../types";
import { normalizeSearchTitle } from "../types";
import TitleList from "../components/TitleList";
import { TitleGridSkeleton, EpisodeListSkeleton } from "../components/SkeletonComponents";
import { groupByShow, formatUpcomingDate } from "../components/EpisodeComponents";
import { EpisodeShowCard, DeckCardWrapper, UnwatchedCarousel } from "../components/EpisodeShowCard";
import HeroBanner from "../components/HeroBanner";

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

export default function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const [today, setToday] = useState<Episode[]>([]);
  const [upcoming, setUpcoming] = useState<Episode[]>([]);
  const [unwatched, setUnwatched] = useState<Episode[]>([]);
  const [popularTitles, setPopularTitles] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmingTitleId, setConfirmingTitleId] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Cleanup confirmation timer
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

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
        try {
          const data = await api.getUpcomingEpisodes();
          setUnwatched(data.unwatched);
        } catch { /* ignore refetch failure */ }
      }
      console.error("Failed to toggle watched:", err);
      toast.error("Failed to update watched status — please try again");
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
  }, [confirmingTitleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const markAllWatched = useCallback(async (episodeIds: number[]) => {
    const idSet = new Set(episodeIds);
    setUnwatched((prev) => prev.filter((ep) => !idSet.has(ep.id)));

    try {
      await api.watchEpisodesBulk(episodeIds, true);
    } catch (err) {
      try {
        const data = await api.getUpcomingEpisodes();
        setUnwatched(data.unwatched);
      } catch { /* ignore refetch failure */ }
      console.error("Failed to bulk mark watched:", err);
      toast.error("Failed to mark episodes as watched — please try again");
    }
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

  const unwatchedCards = buildUnwatchedCards(unwatched);

  const upcomingByDate = new Map<string, Episode[]>();
  for (const ep of upcoming) {
    if (!ep.air_date) continue;
    if (!upcomingByDate.has(ep.air_date)) upcomingByDate.set(ep.air_date, []);
    upcomingByDate.get(ep.air_date)!.push(ep);
  }

  const noEpisodes = today.length === 0 && upcoming.length === 0 && unwatched.length === 0;

  return (
    <div className="space-y-8">
      {/* Hero Banner (desktop only, full-width) */}
      {unwatched.length > 0 && (
        <div className="-mt-6">
          <HeroBanner episodes={unwatched} />
        </div>
      )}

      {/* Unwatched Episodes */}
      {unwatched.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-bold text-white">{t("home.unwatched")}</h2>
            <Link
              to="/reels"
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-amber-400 transition-colors sm:hidden"
              title="Full-screen reels view"
            >
              <Maximize2 size={14} />
              {t("home.reels")}
            </Link>
          </div>
          <UnwatchedCarousel>
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
          <UnwatchedCarousel>
            {Array.from(groupByShow(today).entries()).map(([titleId, eps]) => (
              <div key={titleId} className="w-80 flex-shrink-0" style={{ scrollSnapAlign: "start" }}>
                <DeckCardWrapper episodeCount={eps.length}>
                  <EpisodeShowCard
                    episode={eps[0]}
                    episodeCount={eps.length}
                  />
                </DeckCardWrapper>
              </div>
            ))}
          </UnwatchedCarousel>
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
                  <UnwatchedCarousel>
                    {Array.from(byShow.entries()).map(([titleId, showEps]) => (
                      <div key={titleId} className="w-80 flex-shrink-0" style={{ scrollSnapAlign: "start" }}>
                        <DeckCardWrapper episodeCount={showEps.length}>
                          <EpisodeShowCard
                            episode={showEps[0]}
                            episodeCount={showEps.length}
                          />
                        </DeckCardWrapper>
                      </div>
                    ))}
                  </UnwatchedCarousel>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
