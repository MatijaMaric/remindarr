import { invalidateLibrary } from "../lib/invalidateLibrary";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import * as api from "../api";
import type {
  Recommendation,
  SuggestionsGroup,
  SuggestionSeedReason,
  SearchTitle,
} from "../types";
import { normalizeSearchTitle } from "../types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "../components/ui/skeleton";
import { Card } from "../components/ui/card";
import { PageHeader, Kicker, Chip } from "../components/design";
import ScrollableRow from "../components/ScrollableRow";
import { MediaCard } from "../components/MediaCard";
import { posterUrl } from "../lib/tmdb-images";

// ─── Utilities ────────────────────────────────────────────────────────────────

function becausePrefix(reason: SuggestionSeedReason, t: TFunction): string {
  if (reason === "loved") return t("discovery.because.loved");
  if (reason === "liked") return t("discovery.because.liked");
  if (reason === "watched") return t("discovery.because.watched");
  return t("discovery.because.tracked");
}

function becauseLabel(
  reason: SuggestionSeedReason,
  title: string,
  t: TFunction,
): string {
  // Full-sentence keys so languages can place the title where it belongs.
  if (reason === "loved") return t("suggestions.becauseLoved", { title });
  if (reason === "liked") return t("suggestions.becauseLiked", { title });
  if (reason === "watched") return t("suggestions.becauseWatched", { title });
  return t("suggestions.becauseTracked", { title });
}

// ─── Small primitives ─────────────────────────────────────────────────────────

type FriendInfo = {
  username: string;
  displayName: string | null;
  image: string | null;
};

function toFriend(r: Recommendation): FriendInfo {
  return {
    username: r.from_user.username,
    displayName: r.from_user.display_name ?? null,
    image: r.from_user.image ?? null,
  };
}

function FriendDot({
  friend,
  size = 20,
}: {
  friend: FriendInfo;
  size?: number;
}) {
  const name = friend.displayName ?? friend.username;
  const initial = (name || "?")[0].toUpperCase();
  if (friend.image) {
    return (
      <img
        src={friend.image}
        alt={name}
        title={name}
        className="rounded-full object-cover ring-[1.5px] ring-border flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  const bgColor = `hsl(${(name.charCodeAt(0) * 47) % 360}, 50%, 40%)`;
  return (
    <div
      title={name}
      className="rounded-full ring-[1.5px] ring-border flex items-center justify-center flex-shrink-0 font-bold text-primary-foreground"
      style={{
        width: size,
        height: size,
        background: bgColor,
        fontSize: Math.round(size * 0.5),
      }}
    >
      {initial}
    </div>
  );
}

function FriendStack({
  friends,
  max = 4,
}: {
  friends: FriendInfo[];
  max?: number;
}) {
  const shown = friends.slice(0, max);
  const extra = friends.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((f, i) => (
        <div key={f.username} style={{ marginLeft: i === 0 ? 0 : -7 }}>
          <FriendDot friend={f} size={18} />
        </div>
      ))}
      {extra > 0 && (
        <div
          className="ring-[1.5px] ring-border rounded-full bg-muted-hover text-foreground-secondary flex items-center justify-center"
          style={{
            marginLeft: -7,
            height: 18,
            minWidth: 18,
            padding: "0 5px",
            fontSize: 9,
            fontWeight: 700,
          }}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}

// ─── Suggestion card ──────────────────────────────────────────────────────────

interface CardItem {
  id: string;
  title: string;
  posterUrl: string | null;
}

function SuggestionCard({
  item,
  friends = [],
  unread,
  note,
  isTracked,
  isDismissed,
  onTrack,
  onDismiss,
  onUndismiss,
}: {
  item: CardItem;
  friends?: FriendInfo[];
  unread?: boolean;
  note?: ReactNode;
  isTracked: boolean;
  isDismissed: boolean;
  onTrack: () => void;
  onDismiss: () => void;
  onUndismiss: () => void;
}) {
  const { t } = useTranslation();
  const src = posterUrl(item.posterUrl, "w342");
  const state = isTracked ? "tracked" : isDismissed ? "dismissed" : null;

  return (
    <div
      className="w-40 sm:w-44 shrink-0"
      style={{ opacity: isDismissed ? 0.6 : 1 }}
    >
      <MediaCard
        aspect="poster"
        to={`/title/${item.id}`}
        imageUrl={src}
        imageAlt={item.title}
        unread={unread && !state}
        title={
          isDismissed ? (
            <span className="line-through">{item.title}</span>
          ) : (
            item.title
          )
        }
        titleClamp={2}
        badge={
          state === "tracked"
            ? { label: `✓ ${t("discovery.trackedBadge")}`, tone: "accent" }
            : state === "dismissed"
              ? { label: t("discovery.dismissed"), tone: "neutral" }
              : undefined
        }
        subtitle={
          friends.length > 0 && !state ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <FriendStack friends={friends} max={3} />
              <span className="truncate">
                {t("discovery.friendCount", { count: friends.length })}
              </span>
            </span>
          ) : undefined
        }
        meta={note}
        footer={
          <div className="flex gap-1.5">
            {isTracked ? (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onTrack();
                }}
                className="flex-1 flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-semibold bg-primary-soft text-primary-text border border-primary-border cursor-pointer"
              >
                ✓ {t("discovery.trackedBadge")}
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onTrack();
                }}
                className="flex-1 flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
              >
                {t("discovery.track")}
              </button>
            )}
            {isDismissed ? (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onUndismiss();
                }}
                className="flex-1 flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-medium bg-fill-subtle text-muted-foreground border border-border hover:bg-accent transition-colors cursor-pointer"
              >
                {t("discovery.undo")}
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onDismiss();
                }}
                className="flex-1 flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-medium bg-muted text-foreground-secondary hover:bg-muted-hover transition-colors cursor-pointer"
              >
                {t("discovery.dismiss")}
              </button>
            )}
          </div>
        }
      />
    </div>
  );
}

// ─── Friend recommendation card ───────────────────────────────────────────────

/**
 * A title one or more friends recommended. Carries the sender's message and
 * marks the recommendations read once the card is on screen, so the unread
 * count (bottom tab bar, More page) clears without a separate list.
 */
function FriendRecCard({
  recs,
  onMarkRead,
  ...card
}: {
  recs: Recommendation[];
  onMarkRead: (id: string) => void;
} & Omit<
  Parameters<typeof SuggestionCard>[0],
  "item" | "friends" | "unread" | "note"
>) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const first = recs[0];
  const unreadKey = recs
    .filter((r) => !r.read_at)
    .map((r) => r.id)
    .join(",");

  useEffect(() => {
    const el = ref.current;
    if (!unreadKey || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        for (const id of unreadKey.split(",")) onMarkRead(id);
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [unreadKey, onMarkRead]);

  const withMessage = recs.find((r) => r.message);
  const isDirect = recs.some((r) => r.is_targeted);
  const note =
    withMessage || isDirect ? (
      <span className="block line-clamp-2 select-text">
        {isDirect && (
          <span className="not-italic font-semibold text-primary-text mr-1">
            {t("discovery.direct")}
          </span>
        )}
        {withMessage && (
          <>
            <span className="italic">&ldquo;{withMessage.message}&rdquo;</span>{" "}
            — @{withMessage.from_user.username}
          </>
        )}
      </span>
    ) : undefined;

  return (
    <div ref={ref} className="shrink-0">
      <SuggestionCard
        {...card}
        item={{
          id: first.title.id,
          title: first.title.title,
          posterUrl: first.title.poster_url,
        }}
        friends={recs.map(toFriend)}
        unread={unreadKey !== ""}
        note={note}
      />
    </div>
  );
}

// ─── Hero card ────────────────────────────────────────────────────────────────

function DiscoveryHero({
  hero,
  algoGroup,
  friendRecs,
  onTrack,
  onDismiss,
}: {
  hero: SearchTitle;
  algoGroup: SuggestionsGroup | null;
  friendRecs: Recommendation[];
  onTrack: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const src = posterUrl(hero.posterUrl, "w342");
  const sourceSrc = posterUrl(algoGroup?.source.posterUrl, "w92");
  const topFriend = friendRecs[0] ?? null;

  return (
    <Card
      radius="2xl"
      padding="lg"
      className="mb-8 w-full grid grid-cols-1 sm:grid-cols-[280px_1fr] lg:grid-cols-[320px_1fr] gap-6 sm:gap-8 items-stretch"
    >
      {/* Poster */}
      <div className="relative aspect-[2/3] rounded-[10px] overflow-hidden max-w-[200px] sm:max-w-none mx-auto sm:mx-0 shadow-2xl">
        <Link to={`/title/${hero.id}`} className="block w-full h-full">
          {src ? (
            <img
              src={src}
              alt={hero.title}
              className="w-full h-full object-cover"
              loading="lazy"
              width={342}
              height={513}
            />
          ) : (
            <div className="w-full h-full bg-muted" />
          )}
        </Link>
      </div>

      {/* Info */}
      <div className="flex flex-col min-w-0 py-1">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Kicker>{t("discovery.hero.kicker")}</Kicker>
        </div>

        <h2 className="text-[26px] sm:text-[36px] lg:text-[40px] font-extrabold tracking-[-0.03em] leading-[1.02] text-foreground mb-3">
          {hero.title}
        </h2>

        <div className="flex flex-wrap gap-2 mb-5">
          <Chip variant="default">
            {hero.objectType === "SHOW"
              ? t("discovery.hero.tvSeries")
              : t("discovery.movie")}
          </Chip>
          {hero.genres?.slice(0, 3).map((g) => (
            <Chip key={g} variant="default">
              {g}
            </Chip>
          ))}
          {hero.releaseYear && (
            <Chip variant="default">{hero.releaseYear}</Chip>
          )}
          {hero.matchScore != null && (
            <Chip variant="amber">
              {t("discovery.hero.match", { score: hero.matchScore })}
            </Chip>
          )}
        </div>

        {/* Signal grid: algo source, plus friends when any recommended it */}
        <div
          className={`grid grid-cols-1 gap-3 mb-5 ${friendRecs.length > 0 ? "sm:grid-cols-2" : ""}`}
        >
          {/* Algo source */}
          <div className="bg-fill-subtle border border-border rounded-lg p-3.5 flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[11px] font-semibold bg-primary-soft text-primary-text border border-primary-border">
                Remindarr
              </span>
              <span className="text-[11px] text-muted-foreground font-mono">
                {t("discovery.hero.algo")}
              </span>
            </div>
            {algoGroup ? (
              <div className="flex gap-2.5 items-center">
                {sourceSrc && (
                  <div className="w-8 h-12 rounded-sm overflow-hidden flex-shrink-0 bg-muted">
                    <img
                      src={sourceSrc}
                      alt={algoGroup.source.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      width={32}
                      height={48}
                    />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground mb-0.5">
                    {becausePrefix(algoGroup.source.reason, t)}
                  </p>
                  <p className="text-[13px] text-foreground-secondary font-semibold truncate">
                    {algoGroup.source.title}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground leading-snug">
                {t("discovery.hero.tasteProfile")}
              </p>
            )}
          </div>

          {/* Friends source */}
          {friendRecs.length > 0 && (
            <div className="bg-fill-subtle border border-border rounded-lg p-3.5 flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[11px] font-semibold bg-info/[0.10] text-info border border-info/[0.2]">
                  {t("discovery.hero.friends")}
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {t("discovery.hero.recCount", { count: friendRecs.length })}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <FriendStack friends={friendRecs.map(toFriend)} max={4} />
                  <span className="text-xs text-foreground-secondary truncate">
                    {friendRecs
                      .slice(0, 2)
                      .map(
                        (r) =>
                          (
                            r.from_user.display_name ?? r.from_user.username
                          ).split(" ")[0],
                      )
                      .join(", ")}
                    {friendRecs.length > 2 ? ` +${friendRecs.length - 2}` : ""}
                  </span>
                </div>
                {topFriend?.message && (
                  <p className="text-xs text-muted-foreground italic leading-snug line-clamp-2 select-text">
                    &ldquo;{topFriend.message}&rdquo;
                    <span className="not-italic text-muted-foreground">
                      {" "}
                      — @{topFriend.from_user.username}
                    </span>
                  </p>
                )}
                {friendRecs.some((r) => r.is_targeted) && (
                  <span className="inline-flex items-center self-start px-1.5 py-0.5 rounded-sm text-[11px] font-bold bg-primary-soft text-primary-text border border-primary-border">
                    {t("discovery.direct")}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Actions. The hero is always an untracked, undismissed title: acting
            on it moves the next suggestion into its place. */}
        <div className="flex flex-wrap gap-2.5 mt-auto">
          <button
            onClick={onTrack}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-md text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
          >
            {t("discovery.track")}
          </button>
          <Link
            to={`/title/${hero.id}`}
            className="inline-flex items-center justify-center px-[18px] py-2.5 rounded-md text-sm font-semibold bg-fill-subtle border border-border text-foreground hover:bg-accent transition-colors"
          >
            {t("discovery.hero.viewDetails")}
          </Link>
          <button
            onClick={onDismiss}
            className="inline-flex items-center justify-center px-[14px] py-2.5 rounded-md text-sm font-semibold text-muted-foreground border border-border hover:text-foreground-secondary hover:border-border transition-colors cursor-pointer"
          >
            {t("discovery.hero.notInterested")}
          </button>
        </div>
      </div>
    </Card>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHead({
  kicker,
  title,
  sub,
  sourcePosterUrl,
  sourceId,
}: {
  kicker?: string;
  title: string;
  sub?: string;
  sourcePosterUrl?: string | null;
  sourceId?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      {sourcePosterUrl && sourceId && (
        <Link to={`/title/${sourceId}`} className="flex-shrink-0">
          <img
            src={sourcePosterUrl}
            alt=""
            className="w-8 h-12 rounded-sm object-cover"
            loading="lazy"
            width={32}
            height={48}
          />
        </Link>
      )}
      <div>
        {kicker && <Kicker>{kicker}</Kicker>}
        <h2 className="text-base font-bold tracking-[-0.01em] text-foreground leading-snug">
          {title}
        </h2>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DiscoverySkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-card rounded-md p-4">
          <div className="flex gap-3">
            <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <div className="flex gap-3">
                <Skeleton className="w-12 h-[72px] rounded-sm flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DiscoveryPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [trackedSet, setTrackedSet] = useState<Set<string>>(() => new Set());
  const [dismissedSet, setDismissedSet] = useState<Set<string>>(
    () => new Set(),
  );

  const {
    isLoading: recsLoading,
    isError: recsError,
    data: recsData,
  } = useQuery({
    queryKey: ["recommendations"],
    queryFn: ({ signal }) =>
      api.getRecommendations(undefined, undefined, signal),
  });
  const recommendations = useMemo(
    () => recsData?.recommendations ?? [],
    [recsData],
  );

  const {
    isLoading: aggLoading,
    isError: aggError,
    data: aggregate,
  } = useQuery({
    queryKey: ["suggestions", 60],
    queryFn: ({ signal }) => api.getSuggestionsAggregate({ limit: 60 }, signal),
    staleTime: 5 * 60_000,
  });

  // Group received recommendations by title ID for hero + friend overlays
  const recsByTitle = useMemo(() => {
    const m: Record<string, Recommendation[]> = {};
    for (const r of recommendations) {
      if (!m[r.title.id]) m[r.title.id] = [];
      m[r.title.id].push(r);
    }
    return m;
  }, [recommendations]);

  // Hero: first algo suggestion that's not tracked or dismissed this session
  const hero = useMemo(
    () =>
      aggregate?.flat.find(
        (s) => !trackedSet.has(s.id) && !dismissedSet.has(s.id),
      ) ?? null,
    [aggregate, trackedSet, dismissedSet],
  );

  const heroFriendRecs = hero ? (recsByTitle[hero.id] ?? []) : [];
  const heroAlgoGroup = hero
    ? (aggregate?.groups.find((g) =>
        g.suggestions.some((s) => s.id === hero.id),
      ) ?? null)
    : null;

  // More for you: flat list minus hero, minus session-tracked/dismissed
  const moreForYou = useMemo(
    () =>
      aggregate?.flat
        .filter(
          (s) =>
            s.id !== hero?.id &&
            !trackedSet.has(s.id) &&
            !dismissedSet.has(s.id),
        )
        .slice(0, 12) ?? [],
    [aggregate, hero, trackedSet, dismissedSet],
  );

  // "Because you…" rows: each title appears once on the page. A row drops
  // titles already shown in the hero, "Suggested next", the friends row, or
  // an earlier row; a row left with nothing is not rendered (#1407).
  const becauseRows = useMemo(() => {
    const shown = new Set<string>([
      ...(hero ? [hero.id] : []),
      ...moreForYou.map((s) => s.id),
      ...Object.keys(recsByTitle),
    ]);
    return (aggregate?.groups ?? []).flatMap((group) => {
      const visible = group.suggestions.filter(
        (s) =>
          !shown.has(s.id) && !trackedSet.has(s.id) && !dismissedSet.has(s.id),
      );
      for (const s of visible) shown.add(s.id);
      if (visible.length === 0) return [];
      const sessionHidden = group.suggestions.filter(
        (s) => trackedSet.has(s.id) || dismissedSet.has(s.id),
      ).length;
      return [{ group, visible, hidden: group.hiddenCount + sessionHidden }];
    });
  }, [aggregate, hero, moreForYou, recsByTitle, trackedSet, dismissedSet]);

  // ─── Suggestion handlers ──────────────────────────────────────────────────

  const handleTrackSuggestion = useCallback(
    async (titleId: string, titleData?: SearchTitle) => {
      const wasTracked = trackedSet.has(titleId);
      const wasDismissed = dismissedSet.has(titleId);
      setTrackedSet((prev) => new Set([...prev, titleId]));
      setDismissedSet((prev) => {
        const s = new Set(prev);
        s.delete(titleId);
        return s;
      });
      try {
        await api.trackTitle(
          titleId,
          undefined,
          titleData ? normalizeSearchTitle(titleData) : undefined,
        );
        await invalidateLibrary(qc);
      } catch {
        setTrackedSet((prev) => {
          const s = new Set(prev);
          if (wasTracked) s.add(titleId);
          else s.delete(titleId);
          return s;
        });
        setDismissedSet((prev) => {
          const s = new Set(prev);
          if (wasDismissed) s.add(titleId);
          else s.delete(titleId);
          return s;
        });
        toast.error(t("discovery.trackFailed"));
      }
    },
    [t, qc, trackedSet, dismissedSet],
  );

  const handleDismissSuggestion = useCallback(
    async (titleId: string) => {
      const wasTracked = trackedSet.has(titleId);
      const wasDismissed = dismissedSet.has(titleId);
      setDismissedSet((prev) => new Set([...prev, titleId]));
      setTrackedSet((prev) => {
        const s = new Set(prev);
        s.delete(titleId);
        return s;
      });
      try {
        await api.dismissSuggestion(titleId);
        await invalidateLibrary(qc);
      } catch {
        setTrackedSet((prev) => {
          const s = new Set(prev);
          if (wasTracked) s.add(titleId);
          else s.delete(titleId);
          return s;
        });
        setDismissedSet((prev) => {
          const s = new Set(prev);
          if (wasDismissed) s.add(titleId);
          else s.delete(titleId);
          return s;
        });
        toast.error(t("discovery.dismissFailed"));
      }
    },
    [t, qc, trackedSet, dismissedSet],
  );

  const handleUndismiss = useCallback(
    async (titleId: string) => {
      setDismissedSet((prev) => {
        const s = new Set(prev);
        s.delete(titleId);
        return s;
      });
      try {
        await api.undismissSuggestion(titleId);
        await invalidateLibrary(qc);
      } catch {
        setDismissedSet((prev) => new Set([...prev, titleId]));
        toast.error(t("discovery.dismissFailed"));
      }
    },
    [qc, t],
  );

  const handleMarkRead = useCallback(
    async (id: string) => {
      try {
        await api.markRecommendationRead(id);
        qc.setQueryData<{ recommendations: Recommendation[] }>(
          ["recommendations"],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              recommendations: old.recommendations.map((r) =>
                r.id === id ? { ...r, read_at: new Date().toISOString() } : r,
              ),
            };
          },
        );
        void qc.invalidateQueries({ queryKey: ["notification-count"] });
      } catch {
        // Silent failure for mark-read
      }
    },
    [qc],
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  const friendEntries = Object.entries(recsByTitle);
  const isEmpty =
    !hero && friendEntries.length === 0 && becauseRows.length === 0;

  return (
    <div className="space-y-0">
      <PageHeader
        kicker={t("discovery.kicker")}
        title={t("discovery.forYou")}
        right={
          trackedSet.size > 0 || dismissedSet.size > 0 ? (
            <span className="text-xs text-muted-foreground">
              {t("discovery.sessionCounts", {
                tracked: trackedSet.size,
                dismissed: dismissedSet.size,
              })}
            </span>
          ) : undefined
        }
      />

      {/* Wait for both sources: an empty friends feed must not show the empty
          state while suggestions are still loading (#1407). */}
      {recsLoading || aggLoading ? (
        <DiscoverySkeleton />
      ) : isEmpty ? (
        recsError || aggError ? (
          <div className="bg-destructive-soft border border-destructive/40 text-destructive px-4 py-2 rounded-md text-sm">
            {t("discovery.loadFailed")}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm py-8 text-center">
            {t("discovery.empty")}{" "}
            <Link to="/browse" className="underline">
              {t("discovery.emptyCta")}
            </Link>
          </p>
        )
      ) : (
        <div className="space-y-8">
          {/* Hero — combined algo + friends */}
          {hero && (
            <DiscoveryHero
              hero={hero}
              algoGroup={heroAlgoGroup}
              friendRecs={heroFriendRecs}
              onTrack={() => handleTrackSuggestion(hero.id, hero)}
              onDismiss={() => handleDismissSuggestion(hero.id)}
            />
          )}

          {/* More for you rail */}
          {moreForYou.length > 0 && (
            <section>
              <SectionHead
                kicker={t("discovery.moreForYou.kicker")}
                title={t("discovery.moreForYou.title")}
                sub={t("discovery.moreForYou.sub")}
              />
              <ScrollableRow className="gap-3 pb-2">
                {moreForYou.map((title) => (
                  <SuggestionCard
                    key={title.id}
                    item={{
                      id: title.id,
                      title: title.title,
                      posterUrl: title.posterUrl,
                    }}
                    friends={(recsByTitle[title.id] ?? []).map(toFriend)}
                    isTracked={trackedSet.has(title.id)}
                    isDismissed={dismissedSet.has(title.id)}
                    onTrack={() => handleTrackSuggestion(title.id, title)}
                    onDismiss={() => handleDismissSuggestion(title.id)}
                    onUndismiss={() => handleUndismiss(title.id)}
                  />
                ))}
              </ScrollableRow>
            </section>
          )}

          {/* Friends are recommending — the one place friend picks are listed */}
          {friendEntries.length > 0 && (
            <section>
              <SectionHead
                kicker={t("discovery.friendRecs.kicker")}
                title={t("discovery.friendRecs.title")}
              />
              <ScrollableRow className="gap-3 pb-2">
                {friendEntries.map(([titleId, recs]) => (
                  <FriendRecCard
                    key={titleId}
                    recs={recs}
                    onMarkRead={handleMarkRead}
                    isTracked={trackedSet.has(titleId)}
                    isDismissed={dismissedSet.has(titleId)}
                    onTrack={() => handleTrackSuggestion(titleId)}
                    onDismiss={() => handleDismissSuggestion(titleId)}
                    onUndismiss={() => handleUndismiss(titleId)}
                  />
                ))}
              </ScrollableRow>
            </section>
          )}

          {/* Because you … rails */}
          {becauseRows.map(({ group, visible, hidden }) => (
            <section key={group.source.id}>
              <SectionHead
                title={becauseLabel(group.source.reason, group.source.title, t)}
                sub={
                  hidden > 0
                    ? t("discovery.hiddenCount", { count: hidden })
                    : undefined
                }
                sourcePosterUrl={posterUrl(group.source.posterUrl, "w92")}
                sourceId={group.source.id}
              />
              <ScrollableRow className="gap-3 pb-2">
                {visible.map((title) => (
                  <SuggestionCard
                    key={title.id}
                    item={{
                      id: title.id,
                      title: title.title,
                      posterUrl: title.posterUrl,
                    }}
                    isTracked={false}
                    isDismissed={false}
                    onTrack={() => handleTrackSuggestion(title.id, title)}
                    onDismiss={() => handleDismissSuggestion(title.id)}
                    onUndismiss={() => handleUndismiss(title.id)}
                  />
                ))}
              </ScrollableRow>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
