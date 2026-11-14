import { invalidateLibrary } from "../lib/invalidateLibrary";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import { PageHeader, Kicker, Pill, Chip } from "../components/design";
import ScrollableRow from "../components/ScrollableRow";
import { MediaCard } from "../components/MediaCard";
import { posterUrl } from "../lib/tmdb-images";

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string, t: TFunction): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffMin < 1) return t("common.relative.justNow");
  if (diffMin < 60) return t("common.relative.minutesAgo", { count: diffMin });
  if (diffHr < 24) return t("common.relative.hoursAgo", { count: diffHr });
  if (diffDay < 30) return t("common.relative.daysAgo", { count: diffDay });
  return new Date(dateStr).toLocaleDateString();
}

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

function StateBadge({ state }: { state: "tracked" | "dismissed" | null }) {
  const { t } = useTranslation();
  if (!state) return null;
  if (state === "tracked") {
    return (
      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-sm bg-primary/90 text-primary-foreground text-[11px] font-semibold">
        ✓ {t("discovery.trackedBadge")}
      </div>
    );
  }
  return (
    <div className="absolute top-2 right-2 px-2 py-0.5 rounded-sm bg-background/85 text-muted-foreground border border-border text-[11px] font-bold">
      {t("discovery.dismissed")}
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
  isTracked,
  isDismissed,
  onTrack,
  onDismiss,
  onUndismiss,
}: {
  item: CardItem;
  friends?: FriendInfo[];
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

// ─── Hero card ────────────────────────────────────────────────────────────────

function DiscoveryHero({
  hero,
  algoGroup,
  friendRecs,
  isTracked,
  isDismissed,
  onTrack,
  onDismiss,
  onUndismiss,
}: {
  hero: SearchTitle;
  algoGroup: SuggestionsGroup | null;
  friendRecs: Recommendation[];
  isTracked: boolean;
  isDismissed: boolean;
  onTrack: () => void;
  onDismiss: () => void;
  onUndismiss: () => void;
}) {
  const { t } = useTranslation();
  const src = hero.posterUrl ? posterUrl(hero.posterUrl, "w342") : null;
  const sourceSrc = algoGroup?.source.posterUrl
    ? posterUrl(algoGroup.source.posterUrl, "w92")
    : null;
  const state = isTracked ? "tracked" : isDismissed ? "dismissed" : null;

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
        <StateBadge state={state} />
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

        {/* Two-source signal grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
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
          <div className="bg-fill-subtle border border-border rounded-lg p-3.5 flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[11px] font-semibold bg-info/[0.10] text-info border border-info/[0.2]">
                {t("discovery.hero.friends")}
              </span>
              <span className="text-[11px] text-muted-foreground font-mono">
                {t("discovery.hero.recCount", { count: friendRecs.length })}
              </span>
            </div>
            {friendRecs.length > 0 ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <FriendStack
                    friends={friendRecs.map((r) => ({
                      username: r.from_user.username,
                      displayName: r.from_user.display_name ?? null,
                      image: r.from_user.image ?? null,
                    }))}
                    max={4}
                  />
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
            ) : (
              <p className="text-xs text-muted-foreground leading-snug">
                {t("discovery.hero.noFriendRecs")}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2.5 mt-auto">
          {isTracked ? (
            <button
              onClick={onTrack}
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-md text-sm font-bold bg-primary-soft text-primary-text border border-primary-border cursor-pointer"
            >
              ✓ {t("discovery.trackedBadge")}
            </button>
          ) : (
            <button
              onClick={onTrack}
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-md text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
            >
              {t("discovery.track")}
            </button>
          )}
          <Link
            to={`/title/${hero.id}`}
            className="inline-flex items-center justify-center px-[18px] py-2.5 rounded-md text-sm font-semibold bg-fill-subtle border border-border text-foreground hover:bg-accent transition-colors"
          >
            {t("discovery.hero.viewDetails")}
          </Link>
          {isDismissed ? (
            <button
              onClick={onUndismiss}
              className="inline-flex items-center justify-center px-[14px] py-2.5 rounded-md text-sm font-medium bg-fill-subtle text-muted-foreground border border-border cursor-pointer"
            >
              {t("discovery.hero.undoDismiss")}
            </button>
          ) : (
            <button
              onClick={onDismiss}
              className="inline-flex items-center justify-center px-[14px] py-2.5 rounded-md text-sm font-semibold text-muted-foreground border border-border hover:text-foreground-secondary hover:border-border transition-colors cursor-pointer"
            >
              {t("discovery.hero.notInterested")}
            </button>
          )}
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

// ─── Activity-tab recommendation card ────────────────────────────────────────

function RecommendationCard({
  rec,
  onTrack,
  onDismiss,
  onMarkRead,
}: {
  rec: Recommendation;
  onTrack: (rec: Recommendation) => void;
  onDismiss: (rec: Recommendation) => void;
  onMarkRead: (rec: Recommendation) => void;
}) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const markedRef = useRef(false);

  useEffect(() => {
    if (rec.read_at || markedRef.current) return;
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !markedRef.current) {
          markedRef.current = true;
          onMarkRead(rec);
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rec, onMarkRead]);

  const isUnread = !rec.read_at;
  const src = posterUrl(rec.title.poster_url, "w92");
  const senderName = rec.from_user.display_name ?? rec.from_user.username;
  const senderInitial = (senderName || "?")[0].toUpperCase();

  return (
    <div
      ref={cardRef}
      className={`bg-card rounded-md p-4 ${isUnread ? "border-l-2 border-l-primary" : ""}`}
    >
      <div className="flex items-center gap-2 mb-3">
        {rec.from_user.image ? (
          <img
            src={rec.from_user.image}
            alt=""
            className="w-7 h-7 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-muted-hover flex items-center justify-center text-xs font-medium text-foreground-secondary flex-shrink-0">
            {senderInitial}
          </div>
        )}
        <span className="text-sm text-foreground-secondary font-medium select-text">
          {senderName}
        </span>
        {rec.is_targeted && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[11px] font-medium bg-primary-soft text-primary-text border border-primary-border">
            {t("discovery.direct")}
          </span>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {formatRelativeTime(rec.created_at, t)}
        </span>
      </div>

      <div className="flex gap-3 mb-3">
        <Link to={`/title/${rec.title.id}`} className="flex-shrink-0">
          {src ? (
            <img
              src={src}
              alt={rec.title.title}
              className="w-12 h-[72px] rounded-sm object-cover"
              loading="lazy"
              width={92}
              height={138}
            />
          ) : (
            <div className="w-12 h-[72px] rounded-sm bg-muted flex items-center justify-center text-muted-foreground text-xs">
              {t("discovery.noPoster")}
            </div>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <Link
            to={`/title/${rec.title.id}`}
            className="text-sm font-medium text-foreground hover:text-primary-text transition-colors line-clamp-2"
          >
            {rec.title.title}
          </Link>
          <p className="text-xs text-muted-foreground mt-0.5">
            {rec.title.object_type === "MOVIE"
              ? t("discovery.movie")
              : t("discovery.tv")}
          </p>
        </div>
      </div>

      {rec.message && (
        <p className="text-sm text-muted-foreground mb-3 italic select-text">
          &ldquo;{rec.message}&rdquo;
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onTrack(rec)}
          className="inline-flex items-center justify-center px-3 py-1.5 rounded-sm text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
        >
          {t("discovery.track")}
        </button>
        <button
          onClick={() => onDismiss(rec)}
          className="inline-flex items-center justify-center px-3 py-1.5 rounded-sm text-xs font-medium bg-muted-hover text-foreground-secondary hover:bg-muted-hover/80 transition-colors cursor-pointer"
        >
          {t("discovery.dismiss")}
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DiscoveryPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"foryou" | "activity">("foryou");
  const [trackedSet, setTrackedSet] = useState<Set<string>>(() => new Set());
  const [dismissedSet, setDismissedSet] = useState<Set<string>>(
    () => new Set(),
  );

  const {
    isLoading: loading,
    isError: error,
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

  const { data: countData } = useQuery({
    queryKey: ["notification-count"],
    queryFn: ({ signal }) => api.getUnreadRecommendationCount(signal),
  });
  const unreadCount = countData?.count ?? 0;

  const { data: aggregate } = useQuery({
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

  // ─── Suggestion (algo) handlers ───────────────────────────────────────────

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

  // ─── Activity-tab handlers ────────────────────────────────────────────────

  const handleMarkRead = useCallback(
    async (rec: Recommendation) => {
      try {
        await api.markRecommendationRead(rec.id);
        qc.setQueryData<{ recommendations: Recommendation[] }>(
          ["recommendations"],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              recommendations: old.recommendations.map((r) =>
                r.id === rec.id
                  ? { ...r, read_at: new Date().toISOString() }
                  : r,
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

  const handleTrackRec = useCallback(
    async (rec: Recommendation) => {
      try {
        await api.trackTitle(rec.title.id);
        await invalidateLibrary(qc);
        if (!rec.read_at) await api.markRecommendationRead(rec.id);
        qc.setQueryData<{ recommendations: Recommendation[] }>(
          ["recommendations"],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              recommendations: old.recommendations.filter(
                (r) => r.id !== rec.id,
              ),
            };
          },
        );
        void qc.invalidateQueries({ queryKey: ["notification-count"] });
        toast.success(t("discovery.tracked", { title: rec.title.title }));
      } catch {
        toast.error(t("discovery.trackFailed"));
      }
    },
    [t, qc],
  );

  const handleDismissRec = useCallback(
    async (rec: Recommendation) => {
      try {
        await api.deleteRecommendation(rec.id);
        await invalidateLibrary(qc);
        qc.setQueryData<{ recommendations: Recommendation[] }>(
          ["recommendations"],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              recommendations: old.recommendations.filter(
                (r) => r.id !== rec.id,
              ),
            };
          },
        );
        void qc.invalidateQueries({ queryKey: ["notification-count"] });
      } catch {
        toast.error(t("discovery.dismissFailed"));
      }
    },
    [t, qc],
  );

  // ─── Derived counts ───────────────────────────────────────────────────────

  const isEmpty =
    !hero &&
    moreForYou.length === 0 &&
    Object.keys(recsByTitle).length === 0 &&
    (!aggregate || aggregate.groups.length === 0);

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

      {/* Tab toggle */}
      <div className="flex gap-2 mb-6">
        <Pill active={tab === "foryou"} onClick={() => setTab("foryou")}>
          {t("discovery.forYou")}
        </Pill>
        <Pill active={tab === "activity"} onClick={() => setTab("activity")}>
          {t("discovery.activity")}
          {unreadCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[11px] font-bold">
              {unreadCount}
            </span>
          )}
        </Pill>
      </div>

      {/* ── For you tab ─────────────────────────────────────────────────── */}
      {tab === "foryou" &&
        (loading ? (
          <DiscoverySkeleton />
        ) : error ? (
          <div className="bg-destructive-soft border border-destructive/40 text-destructive px-4 py-2 rounded-md text-sm">
            {t("discovery.loadFailed", "Failed to load recommendations")}
          </div>
        ) : isEmpty ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            {t("discovery.empty")}{" "}
            <Link to="/browse" className="underline">
              Find and track titles, then rate a few to improve recommendations.
            </Link>
          </p>
        ) : (
          <div className="space-y-8">
            {/* Hero — combined algo + friends */}
            {hero && (
              <DiscoveryHero
                hero={hero}
                algoGroup={heroAlgoGroup}
                friendRecs={heroFriendRecs}
                isTracked={trackedSet.has(hero.id)}
                isDismissed={dismissedSet.has(hero.id)}
                onTrack={() => handleTrackSuggestion(hero.id, hero)}
                onDismiss={() => handleDismissSuggestion(hero.id)}
                onUndismiss={() => handleUndismiss(hero.id)}
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
                      friends={(recsByTitle[title.id] ?? []).map((r) => ({
                        username: r.from_user.username,
                        displayName: r.from_user.display_name ?? null,
                        image: r.from_user.image ?? null,
                      }))}
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

            {/* Friends are recommending */}
            {Object.keys(recsByTitle).length > 0 && (
              <section>
                <SectionHead
                  kicker={t("discovery.friendRecs.kicker")}
                  title={t("discovery.friendRecs.title")}
                />
                <ScrollableRow className="gap-3 pb-2">
                  {Object.entries(recsByTitle).map(([titleId, recs]) => {
                    const first = recs[0];
                    return (
                      <SuggestionCard
                        key={titleId}
                        item={{
                          id: titleId,
                          title: first.title.title,
                          posterUrl: first.title.poster_url,
                        }}
                        friends={recs.map((r) => ({
                          username: r.from_user.username,
                          displayName: r.from_user.display_name ?? null,
                          image: r.from_user.image ?? null,
                        }))}
                        isTracked={trackedSet.has(titleId)}
                        isDismissed={dismissedSet.has(titleId)}
                        onTrack={() => handleTrackSuggestion(titleId)}
                        onDismiss={() => handleDismissSuggestion(titleId)}
                        onUndismiss={() => handleUndismiss(titleId)}
                      />
                    );
                  })}
                </ScrollableRow>
              </section>
            )}

            {/* Because you … rails */}
            {aggregate?.groups.map((group) => {
              const visibleSuggestions = group.suggestions.filter(
                (s) => !trackedSet.has(s.id) && !dismissedSet.has(s.id),
              );
              const sessionHidden = group.suggestions.filter(
                (s) => trackedSet.has(s.id) || dismissedSet.has(s.id),
              ).length;
              const totalHidden = group.hiddenCount + sessionHidden;
              const sourceSrc = group.source.posterUrl
                ? posterUrl(group.source.posterUrl, "w92")
                : null;

              if (visibleSuggestions.length === 0 && totalHidden === 0)
                return null;

              return (
                <section key={group.source.id}>
                  <SectionHead
                    title={becauseLabel(
                      group.source.reason,
                      group.source.title,
                      t,
                    )}
                    sub={
                      totalHidden > 0
                        ? t("discovery.hiddenCount", { count: totalHidden })
                        : undefined
                    }
                    sourcePosterUrl={sourceSrc}
                    sourceId={group.source.id}
                  />
                  {visibleSuggestions.length > 0 ? (
                    <ScrollableRow className="gap-3 pb-2">
                      {visibleSuggestions.map((title) => (
                        <SuggestionCard
                          key={title.id}
                          item={{
                            id: title.id,
                            title: title.title,
                            posterUrl: title.posterUrl,
                          }}
                          friends={(recsByTitle[title.id] ?? []).map((r) => ({
                            username: r.from_user.username,
                            displayName: r.from_user.display_name ?? null,
                            image: r.from_user.image ?? null,
                          }))}
                          isTracked={trackedSet.has(title.id)}
                          isDismissed={dismissedSet.has(title.id)}
                          onTrack={() => handleTrackSuggestion(title.id, title)}
                          onDismiss={() => handleDismissSuggestion(title.id)}
                          onUndismiss={() => handleUndismiss(title.id)}
                        />
                      ))}
                    </ScrollableRow>
                  ) : (
                    <p className="text-xs text-muted-foreground py-2">
                      {t("discovery.allHandled")}
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        ))}

      {/* ── Activity tab ─────────────────────────────────────────────────── */}
      {tab === "activity" &&
        (loading ? (
          <DiscoverySkeleton />
        ) : recommendations.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            {t("discovery.empty")}{" "}
            <Link to="/browse" className="underline">
              Find and track titles, then rate a few to improve recommendations.
            </Link>
          </p>
        ) : (
          <div className="space-y-3">
            {recommendations.map((rec) => (
              <RecommendationCard
                key={rec.id}
                rec={rec}
                onTrack={handleTrackRec}
                onDismiss={handleDismissRec}
                onMarkRead={handleMarkRead}
              />
            ))}
          </div>
        ))}
    </div>
  );
}
