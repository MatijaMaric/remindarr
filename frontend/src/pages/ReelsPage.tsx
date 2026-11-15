import { invalidateLibrary } from "../lib/invalidateLibrary";
import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import * as api from "../api";
import { normalizeSearchTitle } from "../types";
import type {
  Episode,
  RatingValue,
  SearchTitle,
  Recommendation,
} from "../types";
import ReelsCard from "../components/ReelsCard";
import type { UndoInfo, ReelsCardKind } from "../components/ReelsCard";
import ReelsSeasonPanel from "../components/ReelsSeasonPanel";
import { ReelsSkeleton } from "../components/SkeletonComponents";
import { useContentAdvisory } from "../hooks/useContentAdvisory";
import { HOME_DASHBOARD_STATE } from "../lib/homeView";

// ─── Source types ──────────────────────────────────────────────────────────────

// Keys stay as they were so existing ?source= links keep working.
export type ReelsSource =
  | "coming-soon"
  | "popular"
  | "from-your-genres"
  | "friends-loved"
  | "movies";

const SOURCE_LABELS: Record<ReelsSource, string> = {
  "coming-soon": "Up Next",
  popular: "Popular",
  "from-your-genres": "Recommended",
  "friends-loved": "Friends Loved",
  movies: "Movies",
};

const ALL_SOURCES: ReelsSource[] = [
  "coming-soon",
  "popular",
  "from-your-genres",
  "friends-loved",
  "movies",
];

const EMPTY_STATES: Record<
  ReelsSource,
  { title: string; body: string; to: string; cta: string }
> = {
  "coming-soon": {
    title: "You're all caught up",
    body: "No aired episodes left to watch.",
    to: "/calendar",
    cta: "Open the calendar",
  },
  popular: {
    title: "Nothing popular right now",
    body: "Try again later, or browse everything.",
    to: "/browse",
    cta: "Browse titles",
  },
  "from-your-genres": {
    title: "No recommendations yet",
    body: "When people you follow recommend something, it shows up here.",
    to: "/discovery",
    cta: "Find people to follow",
  },
  "friends-loved": {
    title: "Nothing here yet",
    body: "Follow some friends to see what they love this week",
    to: "/discovery",
    cta: "Find people to follow",
  },
  movies: {
    title: "No movies to watch",
    body: "Released movies you track show up here.",
    to: "/browse",
    cta: "Browse movies",
  },
};

/**
 * Episodes loaded per show. Every mark refetches the feed, so a few is enough;
 * the season panel loads its own season.
 */
const REELS_EPISODES_PER_SHOW = 5;

const TYPE_LABELS: Record<string, string> = { MOVIE: "Movie", SHOW: "Show" };

// ─── ShowCard / helpers ───────────────────────────────────────────────────────

export interface ShowCard {
  titleId: string;
  showTitle: string;
  posterUrl: string | null;
  episodes: Episode[];
  currentIndex: number;
  caughtUp: boolean;
  kind: ReelsCardKind;
  kicker?: string;
  typeLabel?: string;
  isTracked?: boolean;
}

interface UndoAction {
  titleId: string;
  /** The episode as it was before marking, to restore it on undo. */
  episode: Episode;
  episodeCode: string;
  isMovie: boolean;
}

function singleCard(
  ep: Episode,
  extra: Pick<ShowCard, "kind"> & Partial<ShowCard>,
): ShowCard {
  return {
    titleId: ep.title_id,
    showTitle: ep.show_title,
    posterUrl: ep.poster_url,
    episodes: [ep],
    currentIndex: 0,
    caughtUp: false,
    ...extra,
  };
}

/** Convert a MovieTrackItem into a synthetic Episode shape for ReelsCard. */
export function normalizeMovieToReelItem(movie: {
  id: string;
  title: string;
  release_date: string | null;
  release_year: number | null;
  poster_url: string | null;
  age_certification?: string | null;
  offers: { url: string; provider_name: string }[];
}): Episode {
  return {
    id: 0,
    title_id: movie.id,
    season_number: 0,
    episode_number: 0,
    name: movie.title,
    overview: null,
    air_date: movie.release_date,
    still_path: null,
    show_title: movie.title,
    poster_url: movie.poster_url,
    age_certification: movie.age_certification ?? null,
    offers: movie.offers as Episode["offers"],
  };
}

/**
 * Card for a title to discover (browse, recommendations, friends loved).
 * The Episode fields only carry display data; title cards offer Track,
 * never an episode action.
 */
export function titleToCard(input: SearchTitle | Recommendation): ShowCard {
  if ("from_user" in input) {
    const rec = input;
    const from = rec.from_user.display_name ?? rec.from_user.username;
    return singleCard(
      {
        id: 0,
        title_id: rec.title.id,
        season_number: 0,
        episode_number: 0,
        name: rec.title.title,
        overview: rec.message ?? null,
        air_date: null,
        still_path: null,
        show_title: rec.title.title,
        poster_url: rec.title.poster_url,
        age_certification: null,
      },
      {
        kind: "title",
        kicker: `Recommended by ${from}`,
        typeLabel: TYPE_LABELS[rec.title.object_type],
        isTracked: false,
      },
    );
  }
  const t = normalizeSearchTitle(input);
  return singleCard(
    {
      id: 0,
      title_id: t.id,
      season_number: 0,
      episode_number: 0,
      name: t.title,
      overview: t.short_description ?? null,
      air_date: t.release_date ?? null,
      still_path: null,
      show_title: t.title,
      poster_url: t.poster_url,
      age_certification: t.age_certification,
      offers: t.offers,
    },
    {
      kind: "title",
      typeLabel: TYPE_LABELS[t.object_type],
      isTracked: t.is_tracked,
    },
  );
}

function adjustWatchedCount(episodes: Episode[], delta: number): Episode[] {
  return episodes.map((ep) => {
    if (ep.watched_episodes_count == null) return ep;
    const max = ep.total_episodes ?? Number.POSITIVE_INFINITY;
    const next = Math.max(0, Math.min(max, ep.watched_episodes_count + delta));
    return { ...ep, watched_episodes_count: next };
  });
}

function episodeCode(ep: Episode): string {
  return `S${String(ep.season_number).padStart(2, "0")}E${String(ep.episode_number).padStart(2, "0")}`;
}

export function getFirstUnwatchedPerShow(episodes: Episode[]): ShowCard[] {
  const grouped = new Map<string, Episode[]>();
  for (const ep of episodes) {
    if (!grouped.has(ep.title_id)) grouped.set(ep.title_id, []);
    grouped.get(ep.title_id)!.push(ep);
  }

  const cards: ShowCard[] = [];
  for (const [titleId, eps] of grouped) {
    const sorted = [...eps].sort((a, b) => {
      if (a.season_number !== b.season_number)
        return a.season_number - b.season_number;
      return a.episode_number - b.episode_number;
    });
    cards.push({
      titleId,
      showTitle: sorted[0].show_title,
      posterUrl: sorted[0].poster_url,
      episodes: sorted,
      currentIndex: 0,
      caughtUp: false,
      kind: "episode",
    });
  }

  return cards;
}

/**
 * Fresh query data replaces the cards, but keeps the order the user is
 * scrolling through (the server re-sorts by last watched) and keeps the card
 * whose undo window is still open even when the server no longer returns it.
 */
export function mergeCards(
  prev: ShowCard[],
  next: ShowCard[],
  heldTitleId: string | null,
): ShowCard[] {
  const pos = new Map(prev.map((c, i) => [c.titleId, i]));
  const rank = (c: ShowCard) => pos.get(c.titleId) ?? prev.length;
  const merged = [...next].sort((a, b) => rank(a) - rank(b));
  const held = heldTitleId
    ? prev.find((c) => c.titleId === heldTitleId)
    : undefined;
  if (held && !merged.some((c) => c.titleId === held.titleId)) {
    merged.splice(Math.min(rank(held), merged.length), 0, held);
  }
  return merged;
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchCardsForSource(
  source: ReelsSource,
  signal?: AbortSignal,
): Promise<ShowCard[]> {
  switch (source) {
    case "coming-soon": {
      const data = await api.getUpcomingEpisodes(
        signal,
        REELS_EPISODES_PER_SHOW,
      );
      return getFirstUnwatchedPerShow(data.unwatched);
    }
    case "popular": {
      const data = await api.browseTitles({ category: "popular" }, signal);
      return data.titles.map(titleToCard);
    }
    case "from-your-genres": {
      const data = await api.getRecommendations(20, undefined, signal);
      return data.recommendations.map(titleToCard);
    }
    case "friends-loved": {
      try {
        const data = await api.fetchFriendsLoved(signal);
        return (data.titles ?? []).map(titleToCard);
      } catch {
        return [];
      }
    }
    case "movies": {
      const data = await api.getMovieTracking(signal);
      return data.to_watch.map((m) =>
        singleCard(normalizeMovieToReelItem(m), {
          kind: "movie",
          typeLabel: "Movie",
        }),
      );
    }
  }
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function ReelsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawSource = searchParams.get("source") ?? "coming-soon";
  const source: ReelsSource = ALL_SOURCES.includes(rawSource as ReelsSource)
    ? (rawSource as ReelsSource)
    : "coming-soon";

  const { actionFor } = useContentAdvisory();

  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [cards, setCards] = useState<ShowCard[]>([]);
  // Ref is always derived from state — never updated independently.
  // Callbacks read from this ref to access the latest value without
  // needing to be recreated whenever `cards` changes.
  const cardsRef = useRef(cards);
  useLayoutEffect(() => {
    cardsRef.current = cards;
  });
  const cardsSourceRef = useRef<ReelsSource | null>(null);
  const [actionError, setActionError] = useState("");
  const actionErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Undo state. heldTitleRef keeps the marked card in the feed until the
  // undo window closes, even after a refetch drops it.
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldTitleRef = useRef<string | null>(null);

  // Season panel state
  const [seasonPanel, setSeasonPanel] = useState<{
    titleId: string;
    showTitle: string;
    seasonNumber: number;
  } | null>(null);

  // Ephemeral episode rating (shown alongside undo)
  const [reelsRating, setReelsRating] = useState<RatingValue | null>(null);

  // Swipe detection
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Track visible card index for swipe context
  const visibleCardIndexRef = useRef(0);

  const {
    data: reelsData,
    isLoading,
    isError,
    error: loadError,
  } = useQuery({
    queryKey: ["reels", source],
    queryFn: ({ signal }) => fetchCardsForSource(source, signal),
    staleTime: 0, // always refetch on mount since user may have watched things elsewhere
  });

  // Sync local cards from query data, so marks can update cards optimistically
  // without waiting for a refetch.
  useEffect(() => {
    if (!reelsData) return;
    const visible = reelsData.filter((c) => {
      const cert = c.episodes[0]?.age_certification;
      return actionFor(cert, c.titleId) !== "hide";
    });
    const sameSource = cardsSourceRef.current === source;
    cardsSourceRef.current = source;
    setCards((prev) =>
      sameSource ? mergeCards(prev, visible, heldTitleRef.current) : visible,
    );
  }, [reelsData, actionFor, source]);

  // Track visible card via scroll position
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    function onScroll() {
      if (!container) return;
      const cardHeight = container.clientHeight;
      if (cardHeight === 0) return;
      const index = Math.round(container.scrollTop / cardHeight);
      visibleCardIndexRef.current = index;
    }

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  // Seamless loop: when scrolled to the clone at the end, jump to the real first card
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || cards.length === 0) return;

    function onScrollEnd() {
      if (!container) return;
      const cardHeight = container.clientHeight;
      if (cardHeight === 0) return;
      const index = Math.round(container.scrollTop / cardHeight);
      // The clone is at position cards.length (0-indexed)
      if (index >= cards.length) {
        container.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      }
    }

    let scrollTimer: ReturnType<typeof setTimeout>;
    function onScroll() {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(onScrollEnd, 150);
    }

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      clearTimeout(scrollTimer);
    };
  }, [cards.length]);

  // Keyboard navigation
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (!container) return;
      const cardHeight = container.clientHeight;
      const maxIndex = cardsRef.current.length; // clone card is at this index
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        const nextIndex = Math.min(visibleCardIndexRef.current + 1, maxIndex);
        container.scrollTo({ top: nextIndex * cardHeight, behavior: "smooth" });
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        const nextIndex = Math.max(visibleCardIndexRef.current - 1, 0);
        container.scrollTo({ top: nextIndex * cardHeight, behavior: "smooth" });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const openSeason = useCallback((card: ShowCard) => {
    if (card.kind !== "episode" || card.caughtUp) return;
    const currentEp = card.episodes[card.currentIndex];
    if (!currentEp) return;
    setSeasonPanel({
      titleId: card.titleId,
      showTitle: card.showTitle,
      seasonNumber: currentEp.season_number,
    });
  }, []);

  // Swipe detection for season panel
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
      const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
      touchStartRef.current = null;

      // Only trigger on horizontal swipe (dx > 80px, and more horizontal than vertical)
      if (dx < -80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        // Compute visible card index synchronously from current scroll position
        // instead of relying on the async scroll-event-updated ref, which can be
        // stale when the user swipes before CSS snap animation settles.
        const container = scrollRef.current;
        if (!container) return;
        const cardHeight = container.clientHeight;
        if (cardHeight === 0) return;
        const rawIndex = Math.round(container.scrollTop / cardHeight);
        // Handle clone card at the end (maps back to first card)
        const index = rawIndex >= cardsRef.current.length ? 0 : rawIndex;
        const card = cardsRef.current[index];
        if (card) openSeason(card);
      }
    },
    [openSeason],
  );

  function showActionError(msg: string) {
    if (actionErrorTimerRef.current) clearTimeout(actionErrorTimerRef.current);
    setActionError(msg);
    actionErrorTimerRef.current = setTimeout(() => setActionError(""), 5000);
  }

  function clearUndo() {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    heldTitleRef.current = null;
    setUndoAction(null);
  }

  const watchMutation = useMutation({
    mutationFn: ({
      titleId,
      episodeId,
      isMovie,
    }: {
      titleId: string;
      episodeId: number;
      isMovie: boolean;
    }) => (isMovie ? api.watchMovie(titleId) : api.watchEpisode(episodeId)),
    onError: (err: unknown, { titleId }) => {
      setCards((prev) =>
        prev.map((c) => {
          if (c.titleId !== titleId) return c;
          const restoredEpisodes = adjustWatchedCount(c.episodes, -1);
          if (c.caughtUp) {
            return {
              ...c,
              episodes: restoredEpisodes,
              caughtUp: false,
              currentIndex: c.episodes.length - 1,
            };
          }
          return {
            ...c,
            episodes: restoredEpisodes,
            currentIndex: Math.max(0, c.currentIndex - 1),
          };
        }),
      );
      clearUndo();
      showActionError(
        err instanceof Error ? err.message : "Failed to mark as watched",
      );
    },
    onSettled: () => {
      void invalidateLibrary(qc);
    },
  });

  const undoMutation = useMutation({
    mutationFn: ({
      titleId,
      episodeId,
      isMovie,
    }: {
      titleId: string;
      episodeId: number;
      isMovie: boolean;
    }) => (isMovie ? api.unwatchMovie(titleId) : api.unwatchEpisode(episodeId)),
    onError: () => {
      showActionError("Failed to undo");
    },
    onSettled: () => void invalidateLibrary(qc),
  });

  const bulkWatchMutation = useMutation({
    mutationFn: (episodeIds: number[]) =>
      api.watchEpisodesBulk(episodeIds, true),
    onSuccess: () => {
      setSeasonPanel(null);
    },
    onError: () => showActionError("Failed to mark episodes as watched"),
    onSettled: () => {
      void invalidateLibrary(qc);
    },
  });

  const seasonToggleMutation = useMutation({
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
    onError: (
      _err: unknown,
      { currentlyWatched }: { episodeId: number; currentlyWatched: boolean },
    ) =>
      showActionError(
        currentlyWatched
          ? "Failed to unwatch episode"
          : "Failed to watch episode",
      ),
    onSettled: () => {
      void invalidateLibrary(qc);
    },
  });

  const rateReelsMutation = useMutation({
    mutationFn: ({
      episodeId,
      value,
      isActive,
    }: {
      episodeId: number;
      value: RatingValue;
      isActive: boolean;
    }) =>
      isActive
        ? api.unrateEpisode(episodeId)
        : api.rateEpisode(episodeId, value),
    onMutate: ({ value, isActive }) => setReelsRating(isActive ? null : value),
    onError: () => setReelsRating(null),
    onSettled: () => void invalidateLibrary(qc),
  });

  const markWatched = useCallback(
    (titleId: string) => {
      const card = cardsRef.current.find((c) => c.titleId === titleId);
      if (!card || card.caughtUp || card.kind === "title") return;
      const episode = card.episodes[card.currentIndex];
      if (!episode) return;
      const isMovie = card.kind === "movie";

      // Optimistic update
      setCards((prev) => {
        return prev.map((c) => {
          if (c.titleId !== titleId || c.caughtUp) return c;
          const ep = c.episodes[c.currentIndex];
          if (!ep) return c;

          const bumpedEpisodes = adjustWatchedCount(c.episodes, 1);
          const nextIndex = c.currentIndex + 1;
          // ponytail: out of loaded episodes reads as caught up; the refetch
          // after this mark brings the next ones back if there are any.
          if (nextIndex >= c.episodes.length) {
            return { ...c, episodes: bumpedEpisodes, caughtUp: true };
          }
          return { ...c, episodes: bumpedEpisodes, currentIndex: nextIndex };
        });
      });

      // Show undo toast + rating prompt
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      heldTitleRef.current = titleId;
      setUndoAction({
        titleId,
        episode,
        episodeCode: isMovie ? "Movie" : episodeCode(episode),
        isMovie,
      });
      setReelsRating(null);
      undoTimerRef.current = setTimeout(() => {
        heldTitleRef.current = null;
        setUndoAction(null);
        setCards((prev) =>
          prev.filter((c) => !(c.titleId === titleId && c.caughtUp)),
        );
      }, 5000);

      watchMutation.mutate({ titleId, episodeId: episode.id, isMovie });
    },
    [watchMutation],
  );

  const handleReelsRate = useCallback(
    (value: RatingValue) => {
      if (!undoAction) return;
      const isActive = reelsRating === value;
      rateReelsMutation.mutate({
        episodeId: undoAction.episode.id,
        value,
        isActive,
      });
    },
    [undoAction, reelsRating, rateReelsMutation],
  );

  const handleUndo = useCallback(() => {
    if (!undoAction) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    heldTitleRef.current = null;
    setUndoAction(null);

    // Put the marked episode back in front, even if a refetch already
    // replaced this card's episodes.
    const marked = undoAction.episode;
    setCards((prev) =>
      prev.map((c) => {
        if (c.titleId !== undoAction.titleId) return c;
        const restored = adjustWatchedCount(c.episodes, -1);
        const idx = c.episodes.findIndex((e) => e.id === marked.id);
        return {
          ...c,
          episodes: idx >= 0 ? restored : [marked, ...restored],
          currentIndex: Math.max(idx, 0),
          caughtUp: false,
        };
      }),
    );

    undoMutation.mutate({
      titleId: undoAction.titleId,
      episodeId: marked.id,
      isMovie: undoAction.isMovie,
    });
  }, [undoAction, undoMutation]);

  // Season panel: bulk mark watched
  const handleBulkWatch = useCallback(
    (episodeIds: number[]) => {
      bulkWatchMutation.mutate(episodeIds);
    },
    [bulkWatchMutation],
  );

  // Season panel: toggle individual episode watched
  const handleSeasonToggleWatched = useCallback(
    (episodeId: number, currentlyWatched: boolean) => {
      seasonToggleMutation.mutate({ episodeId, currentlyWatched });
    },
    [seasonToggleMutation],
  );

  const getUndoInfo = (titleId: string): UndoInfo | undefined => {
    if (!undoAction || undoAction.titleId !== titleId) return undefined;
    return {
      episodeCode: undoAction.episodeCode,
      currentRating: reelsRating,
      onRate: handleReelsRate,
      onUndo: handleUndo,
    };
  };

  function handleSourceChange(s: ReelsSource) {
    clearUndo();
    setSearchParams({ source: s }, { replace: true });
  }

  if (isLoading) {
    return <ReelsSkeleton />;
  }

  if (isError) {
    const errorMessage =
      loadError instanceof Error ? loadError.message : String(loadError);
    return (
      <div
        className="flex items-center justify-center p-6 safe-top"
        style={{ minHeight: "calc(100dvh - env(safe-area-inset-top, 0px))" }}
      >
        <div className="text-center">
          <p className="text-destructive mb-4">{errorMessage}</p>
          <Link
            to="/"
            state={HOME_DASHBOARD_STATE}
            className="text-primary-text hover:text-primary-text"
          >
            Go back
          </Link>
        </div>
      </div>
    );
  }

  const empty = EMPTY_STATES[source];

  const renderCard = (card: ShowCard, index: number, key: string) => (
    <ReelsCard
      key={key}
      episode={
        card.episodes[
          card.caughtUp ? card.episodes.length - 1 : card.currentIndex
        ]
      }
      kind={card.kind}
      caughtUp={card.caughtUp}
      onMarkWatched={() => markWatched(card.titleId)}
      index={index}
      total={cards.length}
      undoInfo={getUndoInfo(card.titleId)}
      kicker={card.kicker}
      typeLabel={card.typeLabel}
      tracked={card.isTracked}
      onOpenSeason={
        card.kind === "episode" ? () => openSeason(card) : undefined
      }
      blurred={
        actionFor(
          card.episodes[card.currentIndex]?.age_certification,
          card.titleId,
        ) === "blur"
      }
    />
  );

  return (
    // --reels-h is one card's height: the full screen on phones, the screen
    // minus the top nav (h-14 + 1px border) from md up, where that nav shows.
    <div className="[--reels-h:calc(100dvh_-_env(safe-area-inset-top,0px))] md:[--reels-h:calc(100dvh_-_57px)]">
      {/* Home link + source picker — fixed overlay, edge-to-edge with scrim */}
      <div
        className="fixed z-40 left-0 right-0 top-0 md:top-[57px] bg-gradient-to-b from-scrim to-transparent"
        style={{
          paddingTop: "calc(8px + env(safe-area-inset-top, 0px))",
          paddingBottom: 12,
        }}
      >
        <div
          className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          style={{ paddingLeft: 20, paddingRight: 20 }}
        >
          <Link
            to="/"
            state={HOME_DASHBOARD_STATE}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold text-foreground/60 border border-transparent"
          >
            Home
          </Link>
          <span
            className="flex-shrink-0 w-px h-4 bg-accent mx-1"
            aria-hidden="true"
          />
          {ALL_SOURCES.map((s) => (
            <button
              key={s}
              onClick={() => handleSourceChange(s)}
              aria-pressed={s === source}
              className={[
                "flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors cursor-pointer",
                s === source
                  ? "bg-primary text-primary-foreground border border-primary"
                  : "bg-accent backdrop-blur-sm border border-border text-foreground/80 hover:bg-white/[0.25]",
              ].join(" ")}
            >
              {SOURCE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {cards.length === 0 ? (
        <div
          className="flex items-center justify-center p-6"
          style={{
            minHeight: "var(--reels-h)",
            paddingTop: "calc(96px + env(safe-area-inset-top, 0px))",
          }}
        >
          <div className="text-center max-w-xs">
            <p className="text-foreground-secondary text-lg font-semibold mb-2">
              {empty.title}
            </p>
            <p className="text-muted-foreground text-sm mb-6">{empty.body}</p>
            <Link
              to={empty.to}
              className="inline-block px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors"
            >
              {empty.cta}
            </Link>
          </div>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="select-none overflow-y-scroll snap-y snap-mandatory overscroll-y-contain [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          style={{
            height: "var(--reels-h)",
            marginTop: "env(safe-area-inset-top, 0px)",
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {cards.map((card, i) => renderCard(card, i, card.titleId))}
          {/* Clone of first card for seamless loop */}
          {cards.length > 1 && renderCard(cards[0], 0, "clone-first")}
        </div>
      )}

      {/* Action error banner */}
      {actionError && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[70] max-w-sm w-full px-4"
          style={{ top: "calc(1rem + env(safe-area-inset-top, 0px))" }}
        >
          <div className="bg-destructive-soft border border-destructive/40 text-destructive px-4 py-2 rounded-md text-sm text-center">
            {actionError}
          </div>
        </div>
      )}

      {/* Season panel */}
      {seasonPanel && (
        <ReelsSeasonPanel
          titleId={seasonPanel.titleId}
          showTitle={seasonPanel.showTitle}
          seasonNumber={seasonPanel.seasonNumber}
          onClose={() => setSeasonPanel(null)}
          onBulkWatch={handleBulkWatch}
          onToggleWatched={handleSeasonToggleWatched}
        />
      )}
    </div>
  );
}
