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
  ShowEpisodeGroup,
} from "../components/EpisodeComponents";
import { CheckCircle } from "lucide-react";
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

export const MAX_CARDS_PER_SEASON = 3;

export interface UnwatchedCardEntry {
  episode: Episode;
  seasonEpisodeCount: number;
  seasonEpisodeIds: number[];
  seasonNumber: number;
  showTitle: string;
  titleId: string;
  isOverflow?: boolean;
}

export function buildUnwatchedCards(grouped: Map<string, Map<number, Episode[]>>): UnwatchedCardEntry[] {
  const cards: UnwatchedCardEntry[] = [];
  for (const [titleId, seasonMap] of grouped) {
    for (const [seasonNum, eps] of Array.from(seasonMap.entries()).sort(([a], [b]) => a - b)) {
      const ids = eps.map((e) => e.id);
      const visible = eps.slice(0, MAX_CARDS_PER_SEASON);
      for (const ep of visible) {
        cards.push({
          episode: ep,
          seasonEpisodeCount: eps.length,
          seasonEpisodeIds: ids,
          seasonNumber: seasonNum,
          showTitle: ep.show_title,
          titleId,
        });
      }
      if (eps.length > MAX_CARDS_PER_SEASON) {
        cards.push({
          episode: eps[0],
          seasonEpisodeCount: eps.length,
          seasonEpisodeIds: ids,
          seasonNumber: seasonNum,
          showTitle: eps[0].show_title,
          titleId,
          isOverflow: true,
        });
      }
    }
  }
  return cards;
}

const UnwatchedEpisodeCard = memo(function UnwatchedEpisodeCard({ episode, seasonEpisodeCount, seasonEpisodeIds, onToggleWatched, onMarkSeasonWatched }: {
  episode: Episode;
  seasonEpisodeCount: number;
  seasonEpisodeIds: number[];
  onToggleWatched: (id: number, current: boolean) => void;
  onMarkSeasonWatched: (episodeIds: number[]) => void;
}) {
  const { t } = useTranslation();
  const imageUrl = getEpisodeCardImageUrl(episode);
  const providers = getUniqueProviders(episode.offers);

  return (
    <div className="bg-zinc-900 rounded-xl overflow-hidden flex flex-col h-full">
      {/* Episode image */}
      <Link to={`/title/${episode.title_id}/season/${episode.season_number}/episode/${episode.episode_number}`} className="block">
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
          {t("home.season", { number: episode.season_number })} · {t("home.episodesRemaining", { count: seasonEpisodeCount })}
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

        {/* Actions */}
        <div className="mt-auto pt-3 space-y-1.5">
          <button
            onClick={() => onToggleWatched(episode.id, !!episode.is_watched)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <CheckCircle size={14} />
            {t("home.markWatched")}
          </button>
          {seasonEpisodeCount > 1 && (
            <button
              onClick={() => onMarkSeasonWatched(seasonEpisodeIds)}
              className="w-full text-center text-xs text-zinc-400 hover:text-emerald-400 transition-colors cursor-pointer"
            >
              {t("home.markSeasonWatched")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

const UnwatchedOverflowCard = memo(function UnwatchedOverflowCard({ titleId, showTitle, posterUrl, seasonNumber, overflowCount, seasonEpisodeIds, onMarkSeasonWatched }: {
  titleId: string;
  showTitle: string;
  posterUrl: string | null;
  seasonNumber: number;
  overflowCount: number;
  seasonEpisodeIds: number[];
  onMarkSeasonWatched: (episodeIds: number[]) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="bg-zinc-900 rounded-xl overflow-hidden flex flex-col h-full">
      <Link to={`/title/${titleId}`} className="block">
        {posterUrl ? (
          <div className="w-full aspect-video relative">
            <img src={posterUrl} alt={showTitle} className="w-full h-full object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <span className="text-white font-bold text-lg">{t("home.moreEpisodes", { count: overflowCount })}</span>
            </div>
          </div>
        ) : (
          <div className="w-full aspect-video bg-gradient-to-b from-zinc-800 to-zinc-950 flex items-center justify-center">
            <span className="text-white font-bold text-lg">{t("home.moreEpisodes", { count: overflowCount })}</span>
          </div>
        )}
      </Link>
      <div className="p-3 flex flex-col flex-1">
        <Link to={`/title/${titleId}`} className="hover:text-amber-400 transition-colors">
          <h3 className="font-semibold text-white text-sm truncate">{showTitle}</h3>
        </Link>
        <p className="text-xs text-zinc-500 mt-0.5">{t("home.season", { number: seasonNumber })}</p>
        <div className="mt-auto pt-3">
          <button
            onClick={() => onMarkSeasonWatched(seasonEpisodeIds)}
            className="w-full text-center text-xs text-zinc-400 hover:text-emerald-400 transition-colors cursor-pointer"
          >
            {t("home.markSeasonWatched")}
          </button>
        </div>
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
  const unwatchedCards = buildUnwatchedCards(unwatchedByShowAndSeason);

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
            {unwatchedCards.map((card) => {
              if (card.isOverflow) {
                return (
                  <div key={`overflow-${card.titleId}-s${card.seasonNumber}`} className="w-80 flex-shrink-0" style={{ scrollSnapAlign: "start" }}>
                    <UnwatchedOverflowCard
                      titleId={card.titleId}
                      showTitle={card.showTitle}
                      posterUrl={card.episode.poster_url}
                      seasonNumber={card.seasonNumber}
                      overflowCount={card.seasonEpisodeCount - MAX_CARDS_PER_SEASON}
                      seasonEpisodeIds={card.seasonEpisodeIds}
                      onMarkSeasonWatched={markSeasonWatched}
                    />
                  </div>
                );
              }

              return (
                <div key={card.episode.id} className="w-80 flex-shrink-0" style={{ scrollSnapAlign: "start" }}>
                  <UnwatchedEpisodeCard
                    episode={card.episode}
                    seasonEpisodeCount={card.seasonEpisodeCount}
                    seasonEpisodeIds={card.seasonEpisodeIds}
                    onToggleWatched={toggleWatched}
                    onMarkSeasonWatched={markSeasonWatched}
                  />
                </div>
              );
            })}
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
