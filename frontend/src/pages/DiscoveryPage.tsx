import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import * as api from "../api";
import type {
  Recommendation,
  SuggestionsAggregateResponse,
  SuggestionsGroup,
  SuggestionSeedReason,
  SearchTitle,
} from "../types";
import { normalizeSearchTitle } from "../types";
import { useApiCall } from "../hooks/useApiCall";
import { Skeleton } from "../components/ui/skeleton";
import { Card } from "../components/ui/card";
import { PageHeader, Kicker, Pill, Chip } from "../components/design";
import ScrollableRow from "../components/ScrollableRow";
import { posterUrl } from "../lib/tmdb-images";

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function becauseLabel(reason: SuggestionSeedReason, title: string): string {
  if (reason === "loved") return `Because you loved ${title}`;
  if (reason === "liked") return `Because you liked ${title}`;
  if (reason === "watched") return `Because you watched ${title}`;
  return `Because you tracked ${title}`;
}

// ─── Small primitives ─────────────────────────────────────────────────────────

type FriendInfo = { username: string; displayName: string | null; image: string | null };

function FriendDot({ friend, size = 20 }: { friend: FriendInfo; size?: number }) {
  const name = friend.displayName ?? friend.username;
  const initial = (name || "?")[0].toUpperCase();
  if (friend.image) {
    return (
      <img
        src={friend.image}
        alt={name}
        title={name}
        className="rounded-full object-cover ring-[1.5px] ring-zinc-900 flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  const bgColor = `hsl(${(name.charCodeAt(0) * 47) % 360}, 50%, 40%)`;
  return (
    <div
      title={name}
      className="rounded-full ring-[1.5px] ring-zinc-900 flex items-center justify-center flex-shrink-0 font-bold text-zinc-950"
      style={{ width: size, height: size, background: bgColor, fontSize: Math.round(size * 0.5) }}
    >
      {initial}
    </div>
  );
}

function FriendStack({ friends, max = 4 }: { friends: FriendInfo[]; max?: number }) {
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
          className="ring-[1.5px] ring-zinc-900 rounded-full bg-zinc-700 text-zinc-300 flex items-center justify-center"
          style={{ marginLeft: -7, height: 18, minWidth: 18, padding: "0 5px", fontSize: 9, fontWeight: 700 }}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}

function StateBadge({ state }: { state: "tracked" | "dismissed" | null }) {
  if (!state) return null;
  if (state === "tracked") {
    return (
      <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-amber-400/90 text-zinc-950 text-[9px] font-black font-mono uppercase tracking-wider">
        ✓ Tracked
      </div>
    );
  }
  return (
    <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-zinc-950/85 text-zinc-400 border border-white/[0.12] text-[9px] font-bold font-mono uppercase tracking-wider">
      Dismissed
    </div>
  );
}

// ─── Suggestion card ──────────────────────────────────────────────────────────

interface CardItem { id: string; title: string; posterUrl: string | null }

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
  const src = item.posterUrl ? posterUrl(item.posterUrl, "w185") : null;
  const state = isTracked ? "tracked" : isDismissed ? "dismissed" : null;

  return (
    <div className="w-[118px] sm:w-[140px] shrink-0 flex flex-col gap-2" style={{ opacity: isDismissed ? 0.55 : 1 }}>
      <div className="aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800 relative">
        <Link to={`/title/${item.id}`} className="block w-full h-full">
          {src ? (
            <img src={src} alt={item.title} className="w-full h-full object-cover" loading="lazy" width={185} height={278} />
          ) : (
            <div className="w-full h-full bg-zinc-800" />
          )}
        </Link>
        {/* Friend stack overlay bottom-left */}
        {friends.length > 0 && !state && (
          <div className="absolute bottom-2 left-2 bg-zinc-950/80 backdrop-blur-sm rounded-full px-1.5 py-0.5 flex items-center">
            <FriendStack friends={friends} max={3} />
          </div>
        )}
        <StateBadge state={state} />
      </div>
      <p className={`text-[11px] sm:text-xs text-zinc-200 font-medium leading-snug line-clamp-2 ${isDismissed ? "line-through" : ""}`}>
        {item.title}
      </p>
      <div className="flex gap-1">
        {isTracked ? (
          <button
            onClick={onTrack}
            className="flex-1 py-1 rounded text-[10px] font-bold bg-amber-400/[0.16] text-amber-400 border border-amber-400/[0.35] cursor-pointer"
          >
            ✓ Tracked
          </button>
        ) : (
          <button
            onClick={onTrack}
            className="flex-1 py-1 rounded text-[10px] font-bold bg-amber-400 text-zinc-950 hover:bg-amber-300 transition-colors cursor-pointer"
          >
            Track
          </button>
        )}
        {isDismissed ? (
          <button
            onClick={onUndismiss}
            className="flex-1 py-1 rounded text-[10px] font-medium bg-white/[0.04] text-zinc-500 border border-white/[0.08] cursor-pointer"
          >
            Undo
          </button>
        ) : (
          <button
            onClick={onDismiss}
            className="flex-1 py-1 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            Dismiss
          </button>
        )}
      </div>
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
  const src = hero.posterUrl ? posterUrl(hero.posterUrl, "w342") : null;
  const sourceSrc = algoGroup?.source.posterUrl ? posterUrl(algoGroup.source.posterUrl, "w92") : null;
  const state = isTracked ? "tracked" : isDismissed ? "dismissed" : null;

  const topFriend = friendRecs[0] ?? null;

  return (
    <Card radius="2xl" padding="lg" className="mb-8 grid grid-cols-1 sm:grid-cols-[280px_1fr] lg:grid-cols-[320px_1fr] gap-6 sm:gap-8 items-stretch">
      {/* Poster */}
      <div className="relative aspect-[2/3] rounded-[10px] overflow-hidden max-w-[200px] sm:max-w-none mx-auto sm:mx-0 shadow-2xl">
        <Link to={`/title/${hero.id}`} className="block w-full h-full">
          {src ? (
            <img src={src} alt={hero.title} className="w-full h-full object-cover" loading="lazy" width={342} height={513} />
          ) : (
            <div className="w-full h-full bg-zinc-800" />
          )}
        </Link>
        <StateBadge state={state} />
      </div>

      {/* Info */}
      <div className="flex flex-col min-w-0 py-1">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Kicker>Top pick for you</Kicker>
        </div>

        <h2 className="text-[26px] sm:text-[36px] lg:text-[40px] font-extrabold tracking-[-0.03em] leading-[1.02] text-zinc-100 mb-3">
          {hero.title}
        </h2>

        <div className="flex flex-wrap gap-2 mb-5">
          <Chip variant="default">{hero.objectType === "SHOW" ? "TV Series" : "Movie"}</Chip>
          {hero.genres?.slice(0, 3).map((g) => <Chip key={g} variant="default">{g}</Chip>)}
          {hero.releaseYear && <Chip variant="default">{hero.releaseYear}</Chip>}
          {/* TODO(scoring): no match score from /api/suggestions yet */}
        </div>

        {/* Two-source signal grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {/* Algo source */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5 flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black font-mono uppercase tracking-wider bg-amber-400/[0.14] text-amber-400 border border-amber-400/[0.3]">
                Remindarr
              </span>
              <span className="text-[11px] text-zinc-500 font-mono">algo</span>
            </div>
            {algoGroup ? (
              <div className="flex gap-2.5 items-center">
                {sourceSrc && (
                  <div className="w-8 h-12 rounded overflow-hidden flex-shrink-0 bg-zinc-800">
                    <img src={sourceSrc} alt={algoGroup.source.title} className="w-full h-full object-cover" loading="lazy" width={32} height={48} />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-500 mb-0.5">
                    {algoGroup.source.reason === "loved" ? "Because you loved" :
                     algoGroup.source.reason === "liked" ? "Because you liked" :
                     algoGroup.source.reason === "watched" ? "Because you watched" :
                     "Because you tracked"}
                  </p>
                  <p className="text-[13px] text-zinc-200 font-semibold truncate">{algoGroup.source.title}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-400 leading-snug">Top pick from your taste profile.</p>
            )}
          </div>

          {/* Friends source */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5 flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black font-mono uppercase tracking-wider bg-blue-400/[0.10] text-blue-300 border border-blue-400/[0.2]">
                Friends
              </span>
              <span className="text-[11px] text-zinc-500 font-mono">
                {friendRecs.length} {friendRecs.length === 1 ? "rec" : "recs"}
              </span>
            </div>
            {friendRecs.length > 0 ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <FriendStack friends={friendRecs.map((r) => ({ username: r.from_user.username, displayName: r.from_user.display_name ?? null, image: r.from_user.image ?? null }))} max={4} />
                  <span className="text-xs text-zinc-300 truncate">
                    {friendRecs.slice(0, 2).map((r) => (r.from_user.display_name ?? r.from_user.username).split(" ")[0]).join(", ")}
                    {friendRecs.length > 2 ? ` +${friendRecs.length - 2}` : ""}
                  </span>
                </div>
                {topFriend?.message && (
                  <p className="text-xs text-zinc-400 italic leading-snug line-clamp-2 select-text">
                    &ldquo;{topFriend.message}&rdquo;
                    <span className="not-italic text-zinc-500"> — @{topFriend.from_user.username}</span>
                  </p>
                )}
                {friendRecs.some((r) => r.is_targeted) && (
                  <span className="inline-flex items-center self-start px-1.5 py-0.5 rounded text-[9px] font-bold font-mono uppercase tracking-wider bg-amber-400/[0.15] text-amber-400 border border-amber-400/[0.3]">
                    Direct
                  </span>
                )}
              </div>
            ) : (
              <p className="text-xs text-zinc-500 leading-snug">None of your friends have recommended this yet.</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2.5 mt-auto">
          {isTracked ? (
            <button
              onClick={onTrack}
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-sm font-bold bg-amber-400/[0.16] text-amber-400 border border-amber-400/[0.35] cursor-pointer"
            >
              ✓ Tracked
            </button>
          ) : (
            <button
              onClick={onTrack}
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-sm font-bold bg-amber-400 text-black hover:bg-amber-300 transition-colors cursor-pointer"
            >
              Track
            </button>
          )}
          <Link
            to={`/title/${hero.id}`}
            className="inline-flex items-center justify-center px-[18px] py-2.5 rounded-lg text-sm font-semibold bg-white/[0.08] border border-white/[0.14] text-zinc-100 hover:bg-white/[0.14] transition-colors"
          >
            View details
          </Link>
          {isDismissed ? (
            <button
              onClick={onUndismiss}
              className="inline-flex items-center justify-center px-[14px] py-2.5 rounded-lg text-sm font-medium bg-white/[0.04] text-zinc-500 border border-white/[0.08] cursor-pointer"
            >
              Undo dismiss
            </button>
          ) : (
            <button
              onClick={onDismiss}
              className="inline-flex items-center justify-center px-[14px] py-2.5 rounded-lg text-sm font-semibold text-zinc-500 border border-white/[0.08] hover:text-zinc-300 hover:border-white/[0.16] transition-colors cursor-pointer"
            >
              Not interested
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
          <img src={sourcePosterUrl} alt="" className="w-8 h-12 rounded object-cover" loading="lazy" width={32} height={48} />
        </Link>
      )}
      <div>
        {kicker && <Kicker>{kicker}</Kicker>}
        <h2 className="text-base font-bold tracking-[-0.01em] text-zinc-100 leading-snug">{title}</h2>
        {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DiscoverySkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-zinc-900 rounded-lg p-4">
          <div className="flex gap-3">
            <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <div className="flex gap-3">
                <Skeleton className="w-12 h-[72px] rounded flex-shrink-0" />
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
    <div ref={cardRef} className={`bg-zinc-900 rounded-lg p-4 ${isUnread ? "border-l-2 border-l-amber-500" : ""}`}>
      <div className="flex items-center gap-2 mb-3">
        {rec.from_user.image ? (
          <img src={rec.from_user.image} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-300 flex-shrink-0">
            {senderInitial}
          </div>
        )}
        <span className="text-sm text-zinc-300 font-medium select-text">{senderName}</span>
        {rec.is_targeted && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
            Direct
          </span>
        )}
        <span className="text-xs text-zinc-500 ml-auto">{formatRelativeTime(rec.created_at)}</span>
      </div>

      <div className="flex gap-3 mb-3">
        <Link to={`/title/${rec.title.id}`} className="flex-shrink-0">
          {src ? (
            <img src={src} alt={rec.title.title} className="w-12 h-[72px] rounded object-cover" loading="lazy" width={92} height={138} />
          ) : (
            <div className="w-12 h-[72px] rounded bg-zinc-800 flex items-center justify-center text-zinc-600 text-xs">N/A</div>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <Link to={`/title/${rec.title.id}`} className="text-sm font-medium text-white hover:text-amber-400 transition-colors line-clamp-2">
            {rec.title.title}
          </Link>
          <p className="text-xs text-zinc-500 mt-0.5">
            {rec.title.object_type === "MOVIE" ? t("discovery.movie") : t("discovery.tv")}
          </p>
        </div>
      </div>

      {rec.message && (
        <p className="text-sm text-zinc-400 mb-3 italic select-text">&ldquo;{rec.message}&rdquo;</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onTrack(rec)}
          className="inline-flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-medium bg-amber-500 text-zinc-950 hover:bg-amber-400 transition-colors cursor-pointer"
        >
          {t("discovery.track")}
        </button>
        <button
          onClick={() => onDismiss(rec)}
          className="inline-flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors cursor-pointer"
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
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [aggregate, setAggregate] = useState<SuggestionsAggregateResponse | null>(null);
  const [tab, setTab] = useState<"foryou" | "activity">("foryou");
  const [trackedSet, setTrackedSet] = useState<Set<string>>(() => new Set());
  const [dismissedSet, setDismissedSet] = useState<Set<string>>(() => new Set());

  const { loading, error } = useApiCall(
    (signal) => api.getRecommendations(undefined, undefined, signal),
    [],
    { onSuccess: (data) => setRecommendations(data.recommendations) },
  );

  const { data: countData } = useApiCall(
    (signal) => api.getUnreadRecommendationCount(signal),
    [],
  );
  const unreadCount = countData?.count ?? 0;

  useEffect(() => {
    const controller = new AbortController();
    api.getSuggestionsAggregate({ limit: 60 }, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setAggregate(res); })
      .catch(() => {});
    return () => controller.abort();
  }, []);

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
    () => aggregate?.flat.find((s) => !trackedSet.has(s.id) && !dismissedSet.has(s.id)) ?? null,
    [aggregate, trackedSet, dismissedSet],
  );

  const heroFriendRecs = hero ? (recsByTitle[hero.id] ?? []) : [];
  const heroAlgoGroup = hero
    ? (aggregate?.groups.find((g) => g.suggestions.some((s) => s.id === hero.id)) ?? null)
    : null;

  // More for you: flat list minus hero, minus session-tracked/dismissed
  const moreForYou = useMemo(
    () =>
      aggregate?.flat
        .filter((s) => s.id !== hero?.id && !trackedSet.has(s.id) && !dismissedSet.has(s.id))
        .slice(0, 12) ?? [],
    [aggregate, hero, trackedSet, dismissedSet],
  );

  // ─── Suggestion (algo) handlers ───────────────────────────────────────────

  const handleTrackSuggestion = useCallback(async (titleId: string, titleData?: SearchTitle) => {
    setTrackedSet((prev) => new Set([...prev, titleId]));
    setDismissedSet((prev) => { const s = new Set(prev); s.delete(titleId); return s; });
    try {
      await api.trackTitle(titleId, undefined, titleData ? normalizeSearchTitle(titleData) : undefined);
    } catch {
      setTrackedSet((prev) => { const s = new Set(prev); s.delete(titleId); return s; });
      toast.error(t("discovery.trackFailed"));
    }
  }, [t]);

  const handleDismissSuggestion = useCallback(async (titleId: string) => {
    setDismissedSet((prev) => new Set([...prev, titleId]));
    setTrackedSet((prev) => { const s = new Set(prev); s.delete(titleId); return s; });
    try {
      await api.dismissSuggestion(titleId);
    } catch {
      setDismissedSet((prev) => { const s = new Set(prev); s.delete(titleId); return s; });
      toast.error(t("discovery.dismissFailed"));
    }
  }, [t]);

  const handleUndismiss = useCallback(async (titleId: string) => {
    setDismissedSet((prev) => { const s = new Set(prev); s.delete(titleId); return s; });
    try {
      await api.undismissSuggestion(titleId);
    } catch {
      setDismissedSet((prev) => new Set([...prev, titleId]));
    }
  }, []);

  // ─── Activity-tab handlers ────────────────────────────────────────────────

  const handleMarkRead = useCallback(async (rec: Recommendation) => {
    try {
      await api.markRecommendationRead(rec.id);
      setRecommendations((prev) =>
        prev.map((r) => r.id === rec.id ? { ...r, read_at: new Date().toISOString() } : r),
      );
    } catch {
      // Silent failure for mark-read
    }
  }, []);

  const handleTrackRec = useCallback(async (rec: Recommendation) => {
    try {
      await api.trackTitle(rec.title.id);
      if (!rec.read_at) await api.markRecommendationRead(rec.id);
      setRecommendations((prev) => prev.filter((r) => r.id !== rec.id));
      toast.success(t("discovery.tracked", { title: rec.title.title }));
    } catch {
      toast.error(t("discovery.trackFailed"));
    }
  }, [t]);

  const handleDismissRec = useCallback(async (rec: Recommendation) => {
    try {
      await api.deleteRecommendation(rec.id);
      setRecommendations((prev) => prev.filter((r) => r.id !== rec.id));
    } catch {
      toast.error(t("discovery.dismissFailed"));
    }
  }, [t]);

  // ─── Derived counts ───────────────────────────────────────────────────────

  const isEmpty =
    !hero &&
    moreForYou.length === 0 &&
    Object.keys(recsByTitle).length === 0 &&
    (!aggregate || aggregate.groups.length === 0);

  return (
    <div className="space-y-0">
      <PageHeader
        kicker="Based on what you watch & who you follow"
        title="For you"
        right={
          (trackedSet.size > 0 || dismissedSet.size > 0) ? (
            <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-500">
              {trackedSet.size} tracked · {dismissedSet.size} dismissed
            </span>
          ) : undefined
        }
      />

      {/* Tab toggle */}
      <div className="flex gap-2 mb-6">
        <Pill active={tab === "foryou"} onClick={() => setTab("foryou")}>
          For you
        </Pill>
        <Pill active={tab === "activity"} onClick={() => setTab("activity")}>
          Activity
          {unreadCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-zinc-950 text-[9px] font-bold">
              {unreadCount}
            </span>
          )}
        </Pill>
      </div>

      {/* ── For you tab ─────────────────────────────────────────────────── */}
      {tab === "foryou" && (
        loading ? (
          <DiscoverySkeleton />
        ) : error ? (
          <div className="bg-red-900/50 border border-red-800 text-red-200 px-4 py-2 rounded-lg text-sm">{error}</div>
        ) : isEmpty ? (
          <p className="text-zinc-500 text-sm py-8 text-center">{t("discovery.empty")}</p>
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
                <SectionHead kicker="More for you" title="Suggested next" sub="Ranked by score — tracked and dismissed titles are filtered out." />
                <ScrollableRow>
                  {moreForYou.map((title) => (
                    <SuggestionCard
                      key={title.id}
                      item={{ id: title.id, title: title.title, posterUrl: title.posterUrl }}
                      friends={(recsByTitle[title.id] ?? []).map((r) => ({ username: r.from_user.username, displayName: r.from_user.display_name ?? null, image: r.from_user.image ?? null }))}
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
                <SectionHead kicker="From people you follow" title="Friends are recommending" />
                <ScrollableRow>
                  {Object.entries(recsByTitle).map(([titleId, recs]) => {
                    const first = recs[0];
                    return (
                      <SuggestionCard
                        key={titleId}
                        item={{ id: titleId, title: first.title.title, posterUrl: first.title.poster_url }}
                        friends={recs.map((r) => ({ username: r.from_user.username, displayName: r.from_user.display_name ?? null, image: r.from_user.image ?? null }))}
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
              const sourceSrc = group.source.posterUrl ? posterUrl(group.source.posterUrl, "w92") : null;

              if (visibleSuggestions.length === 0 && totalHidden === 0) return null;

              return (
                <section key={group.source.id}>
                  <SectionHead
                    title={becauseLabel(group.source.reason, group.source.title)}
                    sub={totalHidden > 0 ? `${totalHidden} hidden — already tracked or dismissed` : undefined}
                    sourcePosterUrl={sourceSrc}
                    sourceId={group.source.id}
                  />
                  {visibleSuggestions.length > 0 ? (
                    <ScrollableRow>
                      {visibleSuggestions.map((title) => (
                        <SuggestionCard
                          key={title.id}
                          item={{ id: title.id, title: title.title, posterUrl: title.posterUrl }}
                          friends={(recsByTitle[title.id] ?? []).map((r) => ({ username: r.from_user.username, displayName: r.from_user.display_name ?? null, image: r.from_user.image ?? null }))}
                          isTracked={trackedSet.has(title.id)}
                          isDismissed={dismissedSet.has(title.id)}
                          onTrack={() => handleTrackSuggestion(title.id, title)}
                          onDismiss={() => handleDismissSuggestion(title.id)}
                          onUndismiss={() => handleUndismiss(title.id)}
                        />
                      ))}
                    </ScrollableRow>
                  ) : (
                    <p className="text-xs text-zinc-500 py-2">All suggestions tracked or dismissed.</p>
                  )}
                </section>
              );
            })}
          </div>
        )
      )}

      {/* ── Activity tab ─────────────────────────────────────────────────── */}
      {tab === "activity" && (
        loading ? (
          <DiscoverySkeleton />
        ) : recommendations.length === 0 ? (
          <p className="text-zinc-500 text-sm py-8 text-center">{t("discovery.empty")}</p>
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
        )
      )}
    </div>
  );
}
