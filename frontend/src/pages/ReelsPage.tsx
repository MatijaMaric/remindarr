import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { Link, useSearchParams } from "react-router";
import * as api from "../api";
import { normalizeSearchTitle } from "../types";
import type { Episode, RatingValue, SearchTitle, Recommendation } from "../types";
import ReelsCard from "../components/ReelsCard";
import type { UndoInfo } from "../components/ReelsCard";
import ReelsSeasonPanel from "../components/ReelsSeasonPanel";
import { ReelsSkeleton } from "../components/SkeletonComponents";

// ─── Source types ──────────────────────────────────────────────────────────────

export type ReelsSource = "coming-soon" | "popular" | "from-your-genres" | "friends-loved";

const SOURCE_LABELS: Record<ReelsSource, string> = {
  "coming-soon": "Coming Soon",
  "popular": "Popular",
  "from-your-genres": "From My Genres",
  "friends-loved": "Friends Loved",
};

const ALL_SOURCES: ReelsSource[] = ["coming-soon", "popular", "from-your-genres", "friends-loved"];

// ─── Normalizer ───────────────────────────────────────────────────────────────

/**
 * Convert a Title (from browse/recommendations) into a synthetic Episode shape
 * that ReelsCard can render. This lets non-episode sources plug into the same UI.
 */
export function normalizeToReelItem(input: SearchTitle | Recommendation): Episode {
  if ("from_user" in input) {
    // Recommendation shape
    const rec = input as Recommendation;
    return {
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
    };
  }
  // SearchTitle shape
  const t = normalizeSearchTitle(input as SearchTitle);
  return {
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
    offers: t.offers,
  };
}

// ─── ShowCard / helpers ───────────────────────────────────────────────────────

interface ShowCard {
  titleId: string;
  showTitle: string;
  posterUrl: string | null;
  episodes: Episode[];
  currentIndex: number;
  caughtUp: boolean;
}

interface UndoAction {
  titleId: string;
  previousIndex: number;
  episodeId: number;
  wasCaughtUp: boolean;
}

function adjustWatchedCount(episodes: Episode[], delta: number): Episode[] {
  return episodes.map((ep) => {
    if (ep.watched_episodes_count == null) return ep;
    const max = ep.total_episodes ?? Number.POSITIVE_INFINITY;
    const next = Math.max(0, Math.min(max, ep.watched_episodes_count + delta));
    return { ...ep, watched_episodes_count: next };
  });
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
      if (a.season_number !== b.season_number) return a.season_number - b.season_number;
      return a.episode_number - b.episode_number;
    });
    cards.push({
      titleId,
      showTitle: sorted[0].show_title,
      posterUrl: sorted[0].poster_url,
      episodes: sorted,
      currentIndex: 0,
      caughtUp: false,
    });
  }

  return cards;
}

/** Build ShowCard list from a pre-normalized Episode array (one card per item). */
function episodesToCards(episodes: Episode[]): ShowCard[] {
  return episodes.map((ep) => ({
    titleId: ep.title_id,
    showTitle: ep.show_title,
    posterUrl: ep.poster_url,
    episodes: [ep],
    currentIndex: 0,
    caughtUp: false,
  }));
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchCardsForSource(
  source: ReelsSource,
  signal?: AbortSignal,
): Promise<{ cards: ShowCard[]; friendsLovedEmpty: boolean }> {
  switch (source) {
    case "coming-soon": {
      const data = await api.getUpcomingEpisodes(signal);
      return { cards: getFirstUnwatchedPerShow(data.unwatched), friendsLovedEmpty: false };
    }
    case "popular": {
      const data = await api.browseTitles({ category: "popular" }, signal);
      const episodes = data.titles.map((t) => normalizeToReelItem(t));
      return { cards: episodesToCards(episodes), friendsLovedEmpty: false };
    }
    case "from-your-genres": {
      const data = await api.getRecommendations(20, undefined, signal);
      const episodes = data.recommendations.map((r) => normalizeToReelItem(r));
      return { cards: episodesToCards(episodes), friendsLovedEmpty: false };
    }
    case "friends-loved": {
      try {
        const data = await api.fetchFriendsLoved(signal);
        const episodes = (data.titles ?? []).map((t: SearchTitle) => normalizeToReelItem(t));
        return { cards: episodesToCards(episodes), friendsLovedEmpty: episodes.length === 0 };
      } catch {
        // Endpoint not yet shipped — treat as empty
        return { cards: [], friendsLovedEmpty: true };
      }
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const [cards, setCards] = useState<ShowCard[]>([]);
  // Ref is always derived from state — never updated independently.
  // Callbacks read from this ref to access the latest value without
  // needing to be recreated whenever `cards` changes.
  const cardsRef = useRef(cards);
  useLayoutEffect(() => { cardsRef.current = cards; });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [friendsLovedEmpty, setFriendsLovedEmpty] = useState(false);
  const [actionError, setActionError] = useState("");
  const actionErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Undo state
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Season panel state
  const [seasonPanel, setSeasonPanel] = useState<{ card: ShowCard; seasonNumber: number } | null>(null);

  // Ephemeral episode rating (shown alongside undo)
  const [reelsRating, setReelsRating] = useState<RatingValue | null>(null);

  // Swipe detection
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Track visible card index for swipe context
  const visibleCardIndexRef = useRef(0);

  // Keep a stable ref to the current source so callbacks can read it without
  // being recreated.
  const sourceRef = useRef(source);
  useLayoutEffect(() => { sourceRef.current = source; });

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function load() {
      setLoading(true);
      setError("");
      setFriendsLovedEmpty(false);
      try {
        const { cards: c, friendsLovedEmpty: fl } = await fetchCardsForSource(source, signal);
        if (!signal.aborted) {
          setCards(c);
          setFriendsLovedEmpty(fl);
        }
      } catch (err: unknown) {
        if (!signal.aborted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [source]);

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

  // Swipe detection for season panel
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
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
      if (card && !card.caughtUp) {
        const currentEp = card.episodes[card.currentIndex];
        setSeasonPanel({ card, seasonNumber: currentEp.season_number });
      }
    }
  }, []);

  const markWatched = useCallback(async (titleId: string) => {
    const card = cardsRef.current.find((c) => c.titleId === titleId);
    if (!card || card.caughtUp) return;
    const episode = card.episodes[card.currentIndex];
    if (!episode) return;

    // Store undo action
    const action: UndoAction = {
      titleId,
      previousIndex: card.currentIndex,
      episodeId: episode.id,
      wasCaughtUp: false,
    };

    setCards((prev) => {
      return prev.map((c) => {
        if (c.titleId !== titleId || c.caughtUp) return c;
        const ep = c.episodes[c.currentIndex];
        if (!ep) return c;

        const bumpedEpisodes = adjustWatchedCount(c.episodes, 1);
        const nextIndex = c.currentIndex + 1;
        if (nextIndex >= c.episodes.length) {
          return { ...c, episodes: bumpedEpisodes, caughtUp: true };
        }
        return { ...c, episodes: bumpedEpisodes, currentIndex: nextIndex };
      });
    });

    // Show undo toast + rating prompt
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoAction(action);
    setReelsRating(null);
    undoTimerRef.current = setTimeout(() => {
      setUndoAction(null);
      setCards((prev) => prev.filter((c) => !(c.titleId === titleId && c.caughtUp)));
    }, 5000);

    try {
      await api.watchEpisode(episode.id);
    } catch (err: unknown) {
      // Revert on failure
      setCards((prev) =>
        prev.map((c) => {
          if (c.titleId !== titleId) return c;
          const restoredEpisodes = adjustWatchedCount(c.episodes, -1);
          if (c.caughtUp) {
            return { ...c, episodes: restoredEpisodes, caughtUp: false, currentIndex: c.episodes.length - 1 };
          }
          return { ...c, episodes: restoredEpisodes, currentIndex: Math.max(0, c.currentIndex - 1) };
        })
      );
      setUndoAction(null);
      if (actionErrorTimerRef.current) clearTimeout(actionErrorTimerRef.current);
      setActionError(err instanceof Error ? err.message : "Failed to mark episode as watched");
      actionErrorTimerRef.current = setTimeout(() => setActionError(""), 5000);
    }
  }, []);

  const handleReelsRate = useCallback(async (value: RatingValue) => {
    if (!undoAction) return;
    const isActive = reelsRating === value;
    try {
      if (isActive) {
        await api.unrateEpisode(undoAction.episodeId);
        setReelsRating(null);
      } else {
        await api.rateEpisode(undoAction.episodeId, value);
        setReelsRating(value);
      }
    } catch {
      // Non-critical: silently ignore rating errors in Reels
    }
  }, [undoAction, reelsRating]);

  const handleUndo = useCallback(async () => {
    if (!undoAction) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoAction(null);

    // Revert the card state
    setCards((prev) =>
      prev.map((c) => {
        if (c.titleId !== undoAction.titleId) return c;
        return {
          ...c,
          episodes: adjustWatchedCount(c.episodes, -1),
          currentIndex: undoAction.previousIndex,
          caughtUp: false,
        };
      })
    );

    try {
      await api.unwatchEpisode(undoAction.episodeId);
    } catch (err: unknown) {
      if (actionErrorTimerRef.current) clearTimeout(actionErrorTimerRef.current);
      setActionError(err instanceof Error ? err.message : "Failed to undo");
      actionErrorTimerRef.current = setTimeout(() => setActionError(""), 5000);
    }
  }, [undoAction]);

  // Season panel: bulk mark watched
  const handleBulkWatch = useCallback(async (episodeIds: number[]) => {
    try {
      await api.watchEpisodesBulk(episodeIds, true);
      // Reload data for current source
      const { cards: c, friendsLovedEmpty: fl } = await fetchCardsForSource(sourceRef.current);
      setCards(c);
      setFriendsLovedEmpty(fl);
      setSeasonPanel(null);
    } catch (err: unknown) {
      if (actionErrorTimerRef.current) clearTimeout(actionErrorTimerRef.current);
      setActionError(err instanceof Error ? err.message : "Failed to mark episodes as watched");
      actionErrorTimerRef.current = setTimeout(() => setActionError(""), 5000);
    }
  }, []);

  // Season panel: toggle individual episode watched
  const handleSeasonToggleWatched = useCallback(async (episodeId: number, currentlyWatched: boolean) => {
    try {
      if (currentlyWatched) {
        await api.unwatchEpisode(episodeId);
      } else {
        await api.watchEpisode(episodeId);
      }
      // Reload data for current source
      const { cards: c, friendsLovedEmpty: fl } = await fetchCardsForSource(sourceRef.current);
      setCards(c);
      setFriendsLovedEmpty(fl);
    } catch (err: unknown) {
      if (actionErrorTimerRef.current) clearTimeout(actionErrorTimerRef.current);
      setActionError(err instanceof Error ? err.message : "Failed to update watched status");
      actionErrorTimerRef.current = setTimeout(() => setActionError(""), 5000);
    }
  }, []);

  const getUndoInfo = (titleId: string): UndoInfo | undefined => {
    if (!undoAction || undoAction.titleId !== titleId) return undefined;
    const card = cards.find((c) => c.titleId === titleId);
    if (!card) return undefined;
    const ep = card.episodes.find((e) => e.id === undoAction.episodeId);
    const episodeCode = ep
      ? `S${String(ep.season_number).padStart(2, "0")}E${String(ep.episode_number).padStart(2, "0")}`
      : "episode";
    return {
      episodeCode,
      currentRating: reelsRating,
      onRate: handleReelsRate,
      onUndo: handleUndo,
    };
  };

  function handleSourceChange(s: ReelsSource) {
    setSearchParams({ source: s }, { replace: true });
  }

  if (loading) {
    return <ReelsSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-6 safe-top" style={{ minHeight: "calc(100dvh - env(safe-area-inset-top, 0px))" }}>
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <Link to="/" className="text-amber-400 hover:text-amber-300">
            Go back
          </Link>
        </div>
      </div>
    );
  }

  // Friends-loved empty state — shown inside full Reels chrome
  const showFriendsLovedEmpty = source === "friends-loved" && friendsLovedEmpty;

  // Generic empty state (not friends-loved)
  if (cards.length === 0 && !showFriendsLovedEmpty) {
    return (
      <>
        {/* Source picker overlay — always visible */}
        <div className="fixed z-40" style={{ top: "calc(8px + env(safe-area-inset-top, 0px))", left: 20, right: 20 }}>
          <div className="flex items-center gap-2 mb-2">
            <Link to="/" className="px-3 py-1.5 rounded-full text-[12px] font-bold text-white/55 border border-transparent">Feed</Link>
            <span className="px-3 py-1.5 rounded-full bg-white/[0.15] backdrop-blur border border-white/[0.2] text-[12px] font-bold text-white">Reels</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {ALL_SOURCES.map((s) => (
              <button
                key={s}
                onClick={() => handleSourceChange(s)}
                className={[
                  "px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors cursor-pointer",
                  s === source
                    ? "bg-amber-400 text-zinc-950 border border-amber-400"
                    : "bg-white/[0.15] backdrop-blur-sm border border-white/[0.2] text-white/80 hover:bg-white/[0.25]",
                ].join(" ")}
              >
                {SOURCE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-center p-6" style={{ minHeight: "calc(100dvh - env(safe-area-inset-top, 0px))", paddingTop: "calc(96px + env(safe-area-inset-top, 0px))" }}>
          <div className="text-center">
            <p className="text-zinc-400 text-lg mb-2">No unwatched episodes</p>
            <p className="text-zinc-600 text-sm mb-6">You're all caught up!</p>
            <Link to="/upcoming" className="text-amber-400 hover:text-amber-300">
              View Upcoming
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Feed / Reels mode switcher + source picker — fixed overlay, top-left */}
      <div className="fixed z-40" style={{ top: "calc(8px + env(safe-area-inset-top, 0px))", left: 20, right: 20 }}>
        {/* Feed / Reels toggle row */}
        <div className="flex items-center gap-2 mb-2">
          <Link to="/" className="px-3 py-1.5 rounded-full text-[12px] font-bold text-white/55 border border-transparent">Feed</Link>
          <span className="px-3 py-1.5 rounded-full bg-white/[0.15] backdrop-blur border border-white/[0.2] text-[12px] font-bold text-white">Reels</span>
        </div>
        {/* Source picker chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {ALL_SOURCES.map((s) => (
            <button
              key={s}
              onClick={() => handleSourceChange(s)}
              className={[
                "px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors cursor-pointer",
                s === source
                  ? "bg-amber-400 text-zinc-950 border border-amber-400"
                  : "bg-white/[0.15] backdrop-blur-sm border border-white/[0.2] text-white/80 hover:bg-white/[0.25]",
              ].join(" ")}
            >
              {SOURCE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {showFriendsLovedEmpty ? (
        /* Friends-loved empty state — Reels chrome stays visible */
        <div
          className="flex items-center justify-center p-6"
          style={{ minHeight: "calc(100dvh - env(safe-area-inset-top, 0px))", paddingTop: "calc(96px + env(safe-area-inset-top, 0px))" }}
        >
          <div className="text-center max-w-xs">
            <p className="text-zinc-300 text-lg font-semibold mb-2">Nothing here yet</p>
            <p className="text-zinc-500 text-sm mb-6">
              Follow some friends to see what they love this week
            </p>
            <Link
              to="/discover"
              className="inline-block px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-sm font-semibold transition-colors"
            >
              Find people to follow
            </Link>
          </div>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="overflow-y-scroll snap-y snap-mandatory overscroll-y-contain [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          style={{ height: "calc(100dvh - env(safe-area-inset-top, 0px))", marginTop: "env(safe-area-inset-top, 0px)" }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Cards */}
          {cards.map((card, i) => (
            <ReelsCard
              key={card.titleId}
              episode={card.episodes[card.caughtUp ? card.episodes.length - 1 : card.currentIndex]}
              caughtUp={card.caughtUp}
              onMarkWatched={() => markWatched(card.titleId)}
              index={i}
              total={cards.length}
              undoInfo={getUndoInfo(card.titleId)}
            />
          ))}

          {/* Clone of first card for seamless loop */}
          {cards.length > 1 && (
            <ReelsCard
              key="clone-first"
              episode={cards[0].episodes[cards[0].caughtUp ? cards[0].episodes.length - 1 : cards[0].currentIndex]}
              caughtUp={cards[0].caughtUp}
              onMarkWatched={() => markWatched(cards[0].titleId)}
              index={0}
              total={cards.length}
              undoInfo={getUndoInfo(cards[0].titleId)}
            />
          )}
        </div>
      )}

      {/* Action error banner */}
      {actionError && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[70] max-w-sm w-full px-4" style={{ top: "calc(1rem + env(safe-area-inset-top, 0px))" }}>
          <div className="bg-red-900/50 border border-red-800 text-red-200 px-4 py-2 rounded-lg text-sm text-center">
            {actionError}
          </div>
        </div>
      )}

      {/* Season panel */}
      {seasonPanel && (
        <ReelsSeasonPanel
          showTitle={seasonPanel.card.showTitle}
          episodes={seasonPanel.card.episodes.filter((ep) => ep.season_number === seasonPanel.seasonNumber)}
          seasonNumber={seasonPanel.seasonNumber}
          onClose={() => setSeasonPanel(null)}
          onBulkWatch={handleBulkWatch}
          onToggleWatched={handleSeasonToggleWatched}
        />
      )}
    </>
  );
}
