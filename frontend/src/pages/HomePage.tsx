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
  getEpisodeCardImageUrl,
  groupByShow,
  formatUpcomingDate,
} from "../components/EpisodeComponents";
import { CheckCircle } from "lucide-react";
import { EpisodeListSkeleton } from "../components/SkeletonComponents";
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

/** Shared card component used across Unwatched, Today, and Coming Up sections */
const EpisodeShowCard = memo(function EpisodeShowCard({
  episode,
  episodeCount,
  showActions,
  allEpisodeIds,
  onToggleWatched,
  onMarkAllWatched,
  isConfirming,
}: {
  episode: Episode;
  episodeCount: number;
  showActions?: boolean;
  allEpisodeIds?: number[];
  onToggleWatched?: (id: number, current: boolean) => void;
  onMarkAllWatched?: (episodeIds: number[]) => void;
  isConfirming?: boolean;
}) {
  const { t } = useTranslation();
  const imageUrl = getEpisodeCardImageUrl(episode);
  const providers = getUniqueProviders(episode.offers);

  return (
    <div className="bg-zinc-900 rounded-xl overflow-hidden flex flex-col h-full">
      {/* Episode image with badge */}
      <Link to={`/title/${episode.title_id}/season/${episode.season_number}/episode/${episode.episode_number}`} className="block relative">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={episode.name || formatEpisodeCode(episode)}
            className="w-full aspect-video object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full aspect-video bg-gradient-to-b from-zinc-800 to-zinc-950" />
        )}
        {episodeCount > 1 && (
          <span className="absolute top-2 right-2 bg-black/70 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {episodeCount}
          </span>
        )}
      </Link>

      {/* Content */}
      <div className="p-3 flex flex-col flex-1">
        <Link to={`/title/${episode.title_id}`} className="hover:text-amber-400 transition-colors">
          <h3 className="font-semibold text-white text-sm truncate">{episode.show_title}</h3>
        </Link>
        <Link to={`/title/${episode.title_id}/season/${episode.season_number}/episode/${episode.episode_number}`} className="hover:text-amber-400 transition-colors">
          <p className="text-xs mt-0.5">
            <span className="text-amber-400 font-medium">{formatEpisodeCode(episode)}</span>
            {episode.name && <span className="text-zinc-400"> · {episode.name}</span>}
          </p>
        </Link>

        {/* Season + progress */}
        <p className="text-xs text-zinc-500 mt-1.5">
          {t("home.season", { number: episode.season_number })} · {t("home.episodesRemaining", { count: episodeCount })}
        </p>

        {/* Provider icons */}
        {providers.length > 0 && (
          <div className="flex gap-1.5 mt-2">
            {providers.slice(0, 4).map((o) => (
              <a key={o.provider_id} href={o.url} target="_blank" rel="noopener noreferrer" title={o.provider_name}>
                <img src={o.provider_icon_url} alt={o.provider_name} className="w-6 h-6 rounded" loading="lazy" />
              </a>
            ))}
          </div>
        )}

        {/* Actions (only for Unwatched) */}
        {showActions && onToggleWatched && (
          <div className="mt-auto pt-3 space-y-1.5">
            <button
              onClick={() => onToggleWatched(episode.id, !!episode.is_watched)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <CheckCircle size={14} />
              {t("home.markWatched")}
            </button>
            {episodeCount > 1 && allEpisodeIds && onMarkAllWatched && (
              <button
                onClick={() => onMarkAllWatched(allEpisodeIds)}
                className={`w-full text-center text-xs transition-colors cursor-pointer ${
                  isConfirming
                    ? "text-red-400 hover:text-red-300 font-medium"
                    : "text-zinc-400 hover:text-emerald-400"
                }`}
              >
                {isConfirming
                  ? t("home.confirmMarkAllWatched", { count: allEpisodeIds.length })
                  : t("home.markAllWatched")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

/** Deck-of-cards visual wrapper */
function DeckCardWrapper({ episodeCount, children }: { episodeCount: number; children: React.ReactNode }) {
  return (
    <div className="relative pb-2">
      {/* Second offset layer (deepest) */}
      {episodeCount > 2 && (
        <div className="absolute inset-0 translate-y-2 scale-[0.97] opacity-40 bg-zinc-900 rounded-xl pointer-events-none" />
      )}
      {/* First offset layer */}
      {episodeCount > 1 && (
        <div className="absolute inset-0 translate-y-1 scale-[0.985] opacity-60 bg-zinc-900 rounded-xl pointer-events-none" />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

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
