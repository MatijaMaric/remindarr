import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import * as api from "../api";
import type { Recommendation } from "../types";
import { useApiCall } from "../hooks/useApiCall";
import { Skeleton } from "../components/ui/skeleton";

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
  const posterSrc = rec.title.poster_url
    ? `https://image.tmdb.org/t/p/w92${rec.title.poster_url}`
    : null;

  const senderName = rec.from_user.name ?? rec.from_user.display_name ?? rec.from_user.username;
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

export default function DiscoveryPage() {
  const { t } = useTranslation();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

  const { loading, error } = useApiCall(
    () => api.getRecommendations(),
    [],
    {
      onSuccess: (data) => {
        setRecommendations(data.recommendations);
      },
    },
  );

  const { data: countData } = useApiCall(
    () => api.getUnreadRecommendationCount(),
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">{t("discovery.title")}</h2>
        {unreadCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-amber-500 text-zinc-950 text-xs font-bold">
            {unreadCount}
          </span>
        )}
      </div>

      {loading ? (
        <DiscoverySkeleton />
      ) : error ? (
        <div className="bg-red-900/50 border border-red-800 text-red-200 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      ) : recommendations.length === 0 ? (
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
      )}
    </div>
  );
}
