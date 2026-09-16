import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { Maximize2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import * as api from "../api";
import type {
  Episode,
  Title,
  Recommendation,
  HomepageSection,
  FriendsLovedItem,
  StreakData,
} from "../types";
import { normalizeSearchTitle, DEFAULT_HOMEPAGE_LAYOUT } from "../types";
import StreakCounter from "../components/profile/StreakCounter";
import TitleList from "../components/TitleList";
import { HomeAuthSkeleton } from "../components/SkeletonComponents";
import {
  groupByShow,
  formatUpcomingDate,
} from "../components/EpisodeComponents";
import {
  EpisodeShowCard,
  DeckCardWrapper,
} from "../components/EpisodeShowCard";
import HeroBanner from "../components/HeroBanner";
import FullBleedCarousel from "../components/FullBleedCarousel";
import { Kicker } from "../components/design";
import { posterUrl } from "../lib/tmdb-images";
import UpNextRow from "../components/UpNextRow";
import FriendsLovedRow from "../components/FriendsLovedRow";
import SuggestedForYouRow from "../components/SuggestedForYouRow";
import MovieRow from "../components/MovieRow";
import TrendingSection from "../components/TrendingSection";
import { MediaCard } from "../components/MediaCard";
import type { UpNextItem, MovieTrackResponse } from "../api";

// Module-scope stable empty defaults so downstream memo/effect deps don't see
// a fresh [] each render when authData is absent.
const EMPTY_EPISODES: Episode[] = [];
const EMPTY_RECOMMENDATIONS: Recommendation[] = [];
const EMPTY_UP_NEXT_ITEMS: UpNextItem[] = [];
const EMPTY_FRIENDS_LOVED_ITEMS: FriendsLovedItem[] = [];

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
    const sorted = [...eps].sort((a, b) =>
      a.season_number !== b.season_number
        ? a.season_number - b.season_number
        : a.episode_number - b.episode_number,
    );
    const firstEpisode = sorted[0];
    const allIds = sorted.map((e) => e.id);

    entries.push({
      episode: firstEpisode,
      totalEpisodeCount: eps.length,
      allEpisodeIds: allIds,
      showTitle: firstEpisode.show_title,
      titleId,
    });
  }

  return entries;
}

type AuthHomeData = {
  today: Episode[];
  upcoming: Episode[];
  unwatched: Episode[];
  recommendations: Recommendation[];
  layout: HomepageSection[];
  upNextItems: UpNextItem[];
  friendsLovedItems: FriendsLovedItem[];
  streakData: StreakData | null;
  movieData: MovieTrackResponse;
};

export default function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [confirmingTitleId, setConfirmingTitleId] = useState<string | null>(
    null,
  );
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: anonData, isLoading: anonLoading } = useQuery({
    queryKey: ["home", "anon"],
    enabled: !authLoading && !user,
    queryFn: ({ signal }) =>
      api
        .browseTitles({ category: "popular", page: 1 }, signal)
        .then((res) => res.titles.map(normalizeSearchTitle))
        .catch(() => [] as Title[]),
  });

  // Trending snapshot — shared by the signed-in and signed-out home paths
  // (FR-011). Fails soft: a rejected fetch yields an empty section, never an
  // error that blocks the rest of home (FR-008).
  const { data: trendingData, isLoading: trendingLoading } = useQuery({
    queryKey: ["trending"],
    queryFn: ({ signal }) => api.getTrending(signal),
  });
  const trending = trendingData ?? {
    movies: [],
    shows: [],
    people: [],
    refreshedAt: "",
  };

  const {
    data: authData,
    isLoading: authDataLoading,
    isError: authDataError,
    error: authError,
  } = useQuery<AuthHomeData>({
    queryKey: ["home", "auth"],
    enabled: !authLoading && !!user,
    queryFn: async ({ signal }) => {
      const [
        episodeData,
        recData,
        layoutData,
        upNextData,
        friendsLovedData,
        streakResult,
        moviesResult,
      ] = await Promise.all([
        api.getUpcomingEpisodes(signal),
        api
          .getRecommendations(6, undefined, signal)
          .catch(() => ({ recommendations: [] as Recommendation[], count: 0 })),
        (
          api.getHomepageLayout?.(signal) ??
          Promise.resolve({ homepage_layout: DEFAULT_HOMEPAGE_LAYOUT })
        ).catch(() => ({ homepage_layout: DEFAULT_HOMEPAGE_LAYOUT })),
        api.getUpNext(12, signal).catch(() => ({ items: [] as UpNextItem[] })),
        api
          .getFriendsLoved(20, signal)
          .catch(() => ({ items: [] as FriendsLovedItem[] })),
        api.getMyStreak(signal).catch(() => null),
        api
          .getMovieTracking(signal)
          .catch(() => ({ to_watch: [], upcoming: [] }) as MovieTrackResponse),
      ]);
      return {
        today: episodeData.today,
        upcoming: episodeData.upcoming,
        unwatched: episodeData.unwatched,
        recommendations: recData.recommendations,
        layout: layoutData.homepage_layout,
        upNextItems: upNextData.items,
        friendsLovedItems: friendsLovedData.items,
        streakData: streakResult,
        movieData: moviesResult,
      };
    },
  });

  const toggleWatchedMutation = useMutation({
    mutationFn: ({
      episodeId,
      currentlyWatched,
    }: {
      episodeId: number;
      currentlyWatched: boolean;
    }) =>
      currentlyWatched
        ? api.unwatchEpisode(episodeId)
        : api.watchEpisode(episodeId),
    onMutate: async ({ episodeId, currentlyWatched }) => {
      await qc.cancelQueries({ queryKey: ["home", "auth"] });
      const snapshot = qc.getQueryData<AuthHomeData>(["home", "auth"]);
      qc.setQueryData<AuthHomeData>(["home", "auth"], (prev) => {
        if (!prev) return prev;
        const update = (ep: Episode) =>
          ep.id === episodeId ? { ...ep, is_watched: !currentlyWatched } : ep;
        return {
          ...prev,
          today: prev.today.map(update),
          upcoming: prev.upcoming.map(update),
          unwatched: !currentlyWatched
            ? prev.unwatched.filter((ep) => ep.id !== episodeId)
            : prev.unwatched,
        };
      });
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot)
        qc.setQueryData(["home", "auth"], context.snapshot);
      toast.error("Failed to update watched status — please try again");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["home", "auth"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });

  const markAllWatchedMutation = useMutation({
    mutationFn: (episodeIds: number[]) =>
      api.watchEpisodesBulk(episodeIds, true),
    onMutate: async (episodeIds) => {
      await qc.cancelQueries({ queryKey: ["home", "auth"] });
      const snapshot = qc.getQueryData<AuthHomeData>(["home", "auth"]);
      const idSet = new Set(episodeIds);
      qc.setQueryData<AuthHomeData>(["home", "auth"], (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          unwatched: prev.unwatched.filter((ep) => !idSet.has(ep.id)),
        };
      });
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot)
        qc.setQueryData(["home", "auth"], context.snapshot);
      toast.error("Failed to mark episodes as watched — please try again");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["home", "auth"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });

  const upNextMarkWatchedMutation = useMutation({
    mutationFn: (episodeId: number) => api.watchEpisode(episodeId),
    onMutate: async (episodeId) => {
      await qc.cancelQueries({ queryKey: ["home", "auth"] });
      const snapshot = qc.getQueryData<AuthHomeData>(["home", "auth"]);
      qc.setQueryData<AuthHomeData>(["home", "auth"], (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          upNextItems: prev.upNextItems.filter(
            (item) => item.nextEpisodeId !== episodeId,
          ),
        };
      });
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(["home", "auth"], ctx.snapshot);
      toast.error("Failed to mark episode as watched — please try again");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["home", "auth"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });

  const handleMarkAllWatched = useCallback(
    (titleId: string, episodeIds: number[]) => {
      if (confirmingTitleId === titleId) {
        if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
        setConfirmingTitleId(null);
        markAllWatchedMutation.mutate(episodeIds);
      } else {
        setConfirmingTitleId(titleId);
        if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = setTimeout(
          () => setConfirmingTitleId(null),
          3000,
        );
      }
    },
    [confirmingTitleId, markAllWatchedMutation],
  );

  const today = authData?.today ?? EMPTY_EPISODES;
  const upcoming = authData?.upcoming ?? EMPTY_EPISODES;
  const unwatched = authData?.unwatched ?? EMPTY_EPISODES;
  const recommendations = authData?.recommendations ?? EMPTY_RECOMMENDATIONS;
  const layout = authData?.layout ?? DEFAULT_HOMEPAGE_LAYOUT;
  const upNextItems = authData?.upNextItems ?? EMPTY_UP_NEXT_ITEMS;
  const friendsLovedItems =
    authData?.friendsLovedItems ?? EMPTY_FRIENDS_LOVED_ITEMS;

  const streakData = authData?.streakData ?? null;
  const movieData = authData?.movieData ?? { to_watch: [], upcoming: [] };

  const popularTitlesPreview = useMemo(
    () => (anonData ?? []).slice(0, 12),
    [anonData],
  );

  const unwatchedCards = useMemo(
    () => buildUnwatchedCards(unwatched),
    [unwatched],
  );

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
    [today],
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

  if (
    authLoading ||
    (user ? authData === undefined && authDataLoading : anonLoading)
  ) {
    return <HomeAuthSkeleton />;
  }

  if (!user) {
    return (
      <div className="space-y-10">
        {/* Hero */}
        <div className="text-center py-12">
          <h1 className="text-4xl font-extrabold text-white mb-3">
            {t("landing.tagline")}
          </h1>
          <p className="text-zinc-400 text-lg max-w-xl mx-auto mb-8">
            {t("landing.subtitle")}
          </p>
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

        {/* Trending (movies, TV, people) — available to signed-out visitors */}
        <TrendingSection
          movies={trending.movies}
          shows={trending.shows}
          people={trending.people}
          isLoading={trendingLoading}
        />

        {/* Popular titles */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <Kicker>Browse</Kicker>
              <h2 className="text-xl font-bold tracking-[-0.01em]">
                {t("landing.popularNow")}
              </h2>
            </div>
            <Link
              to="/browse"
              className="font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors"
            >
              {t("landing.discoverMore")} →
            </Link>
          </div>
          <TitleList titles={popularTitlesPreview} />
        </section>
      </div>
    );
  }

  if (authDataError) {
    return (
      <div className="bg-red-900/50 border border-red-800 text-red-200 px-4 py-2 rounded-lg text-sm">
        {authError instanceof Error ? authError.message : String(authError)}
      </div>
    );
  }

  const noEpisodes =
    today.length === 0 && upcoming.length === 0 && unwatched.length === 0;

  function renderSection(sectionId: string) {
    switch (sectionId) {
      case "unwatched":
        return unwatched.length > 0 ? (
          <>
            <div className="-mt-6">
              <HeroBanner
                episodes={unwatched}
                onToggleWatched={(id, w) =>
                  toggleWatchedMutation.mutate({
                    episodeId: id,
                    currentlyWatched: w,
                  })
                }
              />
            </div>
            <section key="unwatched">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <Kicker>Up next</Kicker>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold tracking-[-0.01em]">
                      {t("home.unwatched")}
                    </h2>
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
                <Link
                  to="/upcoming"
                  className="font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors"
                >
                  {t("home.seeAll")} →
                </Link>
              </div>
              <FullBleedCarousel>
                {unwatchedCards.map((card) => (
                  <div
                    key={card.titleId}
                    className="w-80 flex-shrink-0"
                    style={{ scrollSnapAlign: "start" }}
                  >
                    <DeckCardWrapper episodeCount={card.totalEpisodeCount}>
                      <EpisodeShowCard
                        episode={card.episode}
                        episodeCount={card.totalEpisodeCount}
                        showActions
                        allEpisodeIds={card.allEpisodeIds}
                        onToggleWatched={(id, w) =>
                          toggleWatchedMutation.mutate({
                            episodeId: id,
                            currentlyWatched: w,
                          })
                        }
                        onMarkAllWatched={(ids) =>
                          handleMarkAllWatched(card.titleId, ids)
                        }
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
                <h2 className="text-xl font-bold tracking-[-0.01em]">
                  {t("home.recommendedForYou")}
                </h2>
              </div>
              <Link
                to="/discovery"
                className="font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors"
              >
                {t("home.seeAll")} →
              </Link>
            </div>
            <FullBleedCarousel>
              {recommendations.map((rec) => (
                <div
                  key={rec.id}
                  className="w-52 flex-shrink-0"
                  style={{ scrollSnapAlign: "start" }}
                >
                  <MediaCard
                    aspect="poster"
                    hoverZoom
                    to={`/title/${rec.title.id}`}
                    imageUrl={posterUrl(rec.title.poster_url, "w185")}
                    imageAlt={rec.title.title}
                    unread={!rec.read_at}
                    title={rec.title.title}
                    titleClamp={2}
                    subtitle={
                      <span className="text-zinc-400">
                        from @{rec.from_user.username}
                      </span>
                    }
                  />
                </div>
              ))}
            </FullBleedCarousel>
          </section>
        ) : null;

      case "today":
        return (
          <section key="today">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <Kicker>Airing tonight</Kicker>
                <h2 className="text-xl font-bold tracking-[-0.01em]">
                  {t("home.today")}
                </h2>
              </div>
              <Link
                to="/calendar"
                className="font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors"
              >
                {t("home.seeAll")} →
              </Link>
            </div>
            {today.length === 0 ? (
              <p className="text-zinc-400 text-sm">
                {noEpisodes ? t("home.noEpisodes") : t("home.noEpisodesToday")}
              </p>
            ) : (
              <FullBleedCarousel>
                {todayByShowEntries.map(([titleId, eps]) => (
                  <div
                    key={titleId}
                    className="w-80 flex-shrink-0"
                    style={{ scrollSnapAlign: "start" }}
                  >
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
                <h2 className="text-xl font-bold tracking-[-0.01em]">
                  {t("home.comingUp")}
                </h2>
              </div>
              <Link
                to="/calendar"
                className="font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors"
              >
                Open calendar →
              </Link>
            </div>
            <div className="space-y-4">
              {upcomingByDateEntries.map(({ date, dateLabel, byShow }) => (
                <div key={date}>
                  <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400 mb-2">
                    {dateLabel === "__TOMORROW__"
                      ? t("episodes.tomorrow")
                      : dateLabel}
                  </h3>
                  <FullBleedCarousel>
                    {byShow.map(([titleId, showEps]) => (
                      <div
                        key={titleId}
                        className="w-80 flex-shrink-0"
                        style={{ scrollSnapAlign: "start" }}
                      >
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
                <h2 className="text-xl font-bold tracking-[-0.01em]">
                  {t("home.airingSoon.title")}
                </h2>
              </div>
              <Link
                to="/calendar"
                className="font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors"
              >
                Open calendar →
              </Link>
            </div>
            <FullBleedCarousel>
              {airingEntries.map((ep) => (
                <div
                  key={ep.id}
                  className="w-80 flex-shrink-0"
                  style={{ scrollSnapAlign: "start" }}
                >
                  <DeckCardWrapper episodeCount={1}>
                    <EpisodeShowCard
                      episode={ep}
                      episodeCount={1}
                      showCountdown
                    />
                  </DeckCardWrapper>
                </div>
              ))}
            </FullBleedCarousel>
          </section>
        ) : (
          <section key="airing_soon">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <Kicker>Coming up</Kicker>
                <h2 className="text-xl font-bold tracking-[-0.01em]">
                  {t("home.airingSoon.title")}
                </h2>
              </div>
            </div>
            <p className="text-zinc-400 text-sm">
              {t("home.airingSoon.empty")}
            </p>
          </section>
        );

      case "up_next":
        return (
          <section key="up_next">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <Kicker>{t("home.upNext.inProgress")}</Kicker>
                <h2 className="text-xl font-bold tracking-[-0.01em]">
                  {t("home.upNext.title")}
                </h2>
              </div>
            </div>
            <UpNextRow
              items={upNextItems}
              onMarkWatched={(id) => upNextMarkWatchedMutation.mutate(id)}
            />
          </section>
        );

      case "friends_loved":
        return (
          <FriendsLovedRow key="friends_loved" items={friendsLovedItems} />
        );

      case "movies_to_watch":
        return movieData.to_watch.length > 0 ? (
          <section key="movies_to_watch">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <Kicker>Movies</Kicker>
                <h2 className="text-xl font-bold tracking-[-0.01em]">
                  Movies to Watch
                </h2>
              </div>
              <Link
                to="/tracked"
                className="font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors"
              >
                See all →
              </Link>
            </div>
            <MovieRow variant="to_watch" movies={movieData.to_watch} />
          </section>
        ) : null;

      case "upcoming_movies":
        return movieData.upcoming.length > 0 ? (
          <section key="upcoming_movies">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <Kicker>Movies</Kicker>
                <h2 className="text-xl font-bold tracking-[-0.01em]">
                  Upcoming Movies
                </h2>
              </div>
              <Link
                to="/calendar"
                className="font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors"
              >
                Calendar →
              </Link>
            </div>
            <MovieRow variant="upcoming" movies={movieData.upcoming} />
          </section>
        ) : null;

      case "streak":
        return streakData && streakData.currentStreak > 0 ? (
          <section key="streak">
            <StreakCounter variant="home" streak={streakData} />
          </section>
        ) : null;

      case "trending":
        return (
          <TrendingSection
            key="trending"
            movies={trending.movies}
            shows={trending.shows}
            people={trending.people}
            isLoading={trendingLoading}
          />
        );

      default:
        return null;
    }
  }

  return (
    <div className="space-y-8">
      <nav aria-label="Home views" className="flex items-center gap-2">
        <span
          aria-current="page"
          className="px-3 py-1.5 rounded-full bg-white/[0.08] text-sm font-semibold"
        >
          {t("nav.home")}
        </span>
        <Link
          to="/reels"
          className="px-3 py-1.5 rounded-full text-sm font-semibold text-zinc-400 hover:text-amber-400"
        >
          {t("home.reels")}
        </Link>
      </nav>
      {layout.filter((s) => s.enabled).map((s) => renderSection(s.id))}
      <SuggestedForYouRow />
    </div>
  );
}
