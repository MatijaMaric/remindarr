import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import * as api from "../api";
import type { Recommendation } from "../types";
import { useApiCall } from "../hooks/useApiCall";
import { Skeleton } from "../components/ui/skeleton";
import { Card } from "../components/ui/card";
import { PageHeader, Kicker, Pill, Chip } from "../components/design";
import { posterUrl } from "../lib/tmdb-images";

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

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
                <Skeleton className="w-12 h-18 rounded flex-shrink-0" />
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
  const posterSrc = posterUrl(rec.title.poster_url, "w92");

  const senderName = rec.from_user.display_name ?? rec.from_user.username;
  const senderInitial = (senderName || "?")[0].toUpperCase();

  return (
    <div
      ref={cardRef}
      className={`bg-zinc-900 rounded-lg p-4 transition-colors ${isUnread ? "border-l-2 border-l-amber-500" : ""}`}
    >
      {/* Sender row */}
      <div className="flex items-center gap-2 mb-3">
        {rec.from_user.image ? (
          <img
            src={rec.from_user.image}
            alt=""
            className="w-7 h-7 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-300 flex-shrink-0">
            {senderInitial}
          </div>
        )}
        <span className="text-sm text-zinc-300 font-medium">{senderName}</span>
        {rec.is_targeted && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
            Direct
          </span>
        )}
        <span className="text-xs text-zinc-500 ml-auto">{formatRelativeTime(rec.created_at)}</span>
      </div>

      {/* Title info */}
      <div className="flex gap-3 mb-3">
        <Link to={`/title/${rec.title.id}`} className="flex-shrink-0">
          {posterSrc ? (
            <img
              src={posterSrc}
              alt={rec.title.title}
              className="w-12 h-18 rounded object-cover"
              loading="lazy"
              width={92}
              height={138}
            />
          ) : (
            <div className="w-12 h-18 rounded bg-zinc-800 flex items-center justify-center text-zinc-600 text-xs">
              N/A
            </div>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <Link
            to={`/title/${rec.title.id}`}
            className="text-sm font-medium text-white hover:text-amber-400 transition-colors line-clamp-2"
          >
            {rec.title.title}
          </Link>
          <p className="text-xs text-zinc-500 mt-0.5">
            {rec.title.object_type === "MOVIE" ? t("discovery.movie") : t("discovery.tv")}
          </p>
        </div>
      </div>

      {/* Optional message */}
      {rec.message && (
        <p className="text-sm text-zinc-400 mb-3 italic">&ldquo;{rec.message}&rdquo;</p>
      )}

      {/* Actions */}
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

function HeroCard({
  rec,
  onTrack,
  onDismiss,
}: {
  rec: Recommendation;
  onTrack: (rec: Recommendation) => void;
  onDismiss: (rec: Recommendation) => void;
}) {
  const { t } = useTranslation();
  const posterSrc = posterUrl(rec.title.poster_url, "w342");

  const senderName = rec.from_user.display_name ?? rec.from_user.username;
  const typeLabel = rec.title.object_type === "SHOW" ? "TV Series" : "Movie";

  return (
    <Card radius="2xl" padding="lg" className="mb-8 grid grid-cols-1 sm:grid-cols-[280px_1fr] lg:grid-cols-[360px_1fr] gap-6 sm:gap-8 items-stretch">
      {/* Poster */}
      <div className="aspect-[2/3] rounded-[10px] overflow-hidden max-w-[220px] sm:max-w-none mx-auto sm:mx-0 shadow-2xl">
        {posterSrc ? (
          <img
            src={posterSrc}
            alt={rec.title.title}
            className="w-full h-full object-cover"
            loading="lazy"
            width={342}
            height={513}
          />
        ) : (
          <div className="w-full h-full bg-zinc-800" />
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col min-w-0 py-2">
        <Kicker>{rec.is_targeted ? "Just for you" : "Pick of the week"}{senderName ? ` · from @${rec.from_user.username}` : ""}</Kicker>

        <h2 className="text-[30px] sm:text-[36px] lg:text-[44px] font-extrabold tracking-[-0.03em] leading-[1.02] text-zinc-100 mb-3.5">
          {rec.title.title}
        </h2>

        <div className="flex flex-wrap gap-2 mb-4">
          <Chip variant="default">{typeLabel}</Chip>
        </div>

        {/* "Why you'll like it" — featuring sender message */}
        {(rec.message || senderName) && (
          <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3.5 mb-5">
            <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold mb-2">
              Why you'll like it
            </div>
            {rec.message ? (
              <p className="text-sm text-zinc-300 italic leading-relaxed mb-2">&ldquo;{rec.message}&rdquo;</p>
            ) : null}
            {senderName && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-400/[0.08] text-amber-400 border border-amber-400/[0.18] font-medium">
                  Recommended by
                </span>
                <span className="text-xs text-zinc-200 font-medium">{senderName}</span>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2.5 mt-auto">
          <button
            onClick={() => onTrack(rec)}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-sm font-bold bg-amber-400 text-black hover:bg-amber-300 transition-colors cursor-pointer"
          >
            {t("discovery.track")}
          </button>
          <Link
            to={`/title/${rec.title.id}`}
            className="inline-flex items-center justify-center px-[18px] py-2.5 rounded-lg text-sm font-semibold bg-white/[0.08] border border-white/[0.14] text-zinc-100 hover:bg-white/[0.14] transition-colors"
          >
            View details
          </Link>
          <button
            onClick={() => onDismiss(rec)}
            className="inline-flex items-center justify-center px-[14px] py-2.5 rounded-lg text-sm font-semibold text-zinc-500 border border-white/[0.08] hover:text-zinc-300 hover:border-white/[0.16] transition-colors cursor-pointer"
          >
            Not interested
          </button>
        </div>
      </div>
    </Card>
  );
}

function RailCard({
  rec,
  onTrack,
  onDismiss,
}: {
  rec: Recommendation;
  onTrack: (rec: Recommendation) => void;
  onDismiss: (rec: Recommendation) => void;
}) {
  const { t } = useTranslation();
  const posterSrc = posterUrl(rec.title.poster_url, "w185");

  return (
    <div className="w-[118px] sm:w-[140px] shrink-0 flex flex-col gap-2">
      <Link to={`/title/${rec.title.id}`} className="block aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800">
        {posterSrc ? (
          <img
            src={posterSrc}
            alt={rec.title.title}
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
            loading="lazy"
            width={185}
            height={278}
          />
        ) : (
          <div className="w-full h-full bg-zinc-800" />
        )}
      </Link>
      <p className="text-xs text-zinc-300 font-medium line-clamp-2 leading-snug">
        {rec.title.title}
      </p>
      <div className="flex gap-1">
        <button
          onClick={() => onTrack(rec)}
          className="flex-1 py-1 rounded text-[10px] font-semibold bg-amber-500 text-zinc-950 hover:bg-amber-400 transition-colors cursor-pointer"
        >
          {t("discovery.track")}
        </button>
        <button
          onClick={() => onDismiss(rec)}
          className="flex-1 py-1 rounded text-[10px] font-semibold bg-zinc-700 text-zinc-400 hover:bg-zinc-600 transition-colors cursor-pointer"
        >
          {t("discovery.dismiss")}
        </button>
      </div>
    </div>
  );
}

export default function DiscoveryPage() {
  const { t } = useTranslation();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [tab, setTab] = useState<"foryou" | "activity">("foryou");

  const { loading, error } = useApiCall(
    (signal) => api.getRecommendations(undefined, undefined, signal),
    [],
    {
      onSuccess: (data) => {
        setRecommendations(data.recommendations);
      },
    },
  );

  const { data: countData } = useApiCall(
    (signal) => api.getUnreadRecommendationCount(signal),
    [],
  );

  const unreadCount = countData?.count ?? 0;

  const handleMarkRead = useCallback(async (rec: Recommendation) => {
    try {
      await api.markRecommendationRead(rec.id);
      setRecommendations((prev) =>
        prev.map((r) =>
          r.id === rec.id ? { ...r, read_at: new Date().toISOString() } : r,
        ),
      );
    } catch {
      // Silent failure for mark-read
    }
  }, []);

  const handleTrack = useCallback(async (rec: Recommendation) => {
    try {
      await api.trackTitle(rec.title.id);
      if (!rec.read_at) {
        await api.markRecommendationRead(rec.id);
      }
      setRecommendations((prev) => prev.filter((r) => r.id !== rec.id));
      toast.success(t("discovery.tracked", { title: rec.title.title }));
    } catch {
      toast.error(t("discovery.trackFailed"));
    }
  }, [t]);

  const handleDismiss = useCallback(async (rec: Recommendation) => {
    try {
      await api.deleteRecommendation(rec.id);
      setRecommendations((prev) => prev.filter((r) => r.id !== rec.id));
    } catch {
      toast.error(t("discovery.dismissFailed"));
    }
  }, [t]);

  const heroRec = recommendations[0];
  const railRecs = recommendations.slice(1);

  return (
    <div className="space-y-0">
      <PageHeader kicker="Based on what you watch" title="For you" />

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

      {loading ? (
        <DiscoverySkeleton />
      ) : error ? (
        <div className="bg-red-900/50 border border-red-800 text-red-200 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      ) : tab === "foryou" ? (
        recommendations.length === 0 ? (
          <p className="text-zinc-500 text-sm py-8 text-center">
            {t("discovery.empty")}
          </p>
        ) : (
          <div>
            {/* Hero card — first recommendation */}
            <HeroCard
              rec={heroRec}
              onTrack={handleTrack}
              onDismiss={handleDismiss}
            />

            {/* Horizontal rail — remaining recommendations */}
            {railRecs.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                  More recommendations
                </p>
                <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
                  {railRecs.map((rec) => (
                    <RailCard
                      key={rec.id}
                      rec={rec}
                      onTrack={handleTrack}
                      onDismiss={handleDismiss}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        /* Activity tab — original feed */
        recommendations.length === 0 ? (
          <p className="text-zinc-500 text-sm py-8 text-center">
            {t("discovery.empty")}
          </p>
        ) : (
          <div className="space-y-3">
            {recommendations.map((rec) => (
              <RecommendationCard
                key={rec.id}
                rec={rec}
                onTrack={handleTrack}
                onDismiss={handleDismiss}
                onMarkRead={handleMarkRead}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}
