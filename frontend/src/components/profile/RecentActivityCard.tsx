import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { BookmarkPlus, Play, Quote, Star, X } from "lucide-react";
import { DossierCard } from "./atoms/DossierCard";
import { Kicker } from "../design/Kicker";
import * as api from "../../api";
import type { ActivityEvent, ActivityFeedResponse } from "../../types";

type ActivityFetcher = (
  username: string,
  options: { limit?: number; before?: string },
) => Promise<ActivityFeedResponse>;

interface RecentActivityCardProps {
  username: string;
  isOwnProfile?: boolean;
  pageSize?: number;
  /** Override for tests. Defaults to the real API client. */
  fetcher?: ActivityFetcher;
}

const ICON_BY_TYPE: Record<ActivityEvent["type"], "rating" | "watched" | "review" | "track"> = {
  rating_title: "rating",
  rating_episode: "rating",
  watched_title: "watched",
  watched_episode: "watched",
  recommendation: "review",
  tracked: "track",
};

const ICON_STYLES = {
  rating: "bg-amber-400/15 text-amber-400",
  watched: "bg-amber-500/15 text-amber-500",
  review: "bg-sky-500/15 text-sky-400",
  track: "bg-emerald-500/15 text-emerald-400",
} as const;

const RATING_TO_STARS: Record<NonNullable<ActivityEvent["rating"]>, number> = {
  HATE: 1,
  DISLIKE: 2,
  LIKE: 4,
  LOVE: 5,
};

const STATUS_LABEL_KEY: Record<NonNullable<ActivityEvent["status"]>, string> = {
  plan_to_watch: "userProfile.dossier.status.planToWatch",
  watching: "userProfile.dossier.status.watching",
  on_hold: "userProfile.dossier.status.onHold",
  dropped: "userProfile.dossier.status.dropped",
  completed: "userProfile.dossier.status.completed",
};

function ActivityIcon({ type }: { type: ActivityEvent["type"] }) {
  const variant = ICON_BY_TYPE[type];
  const className = `flex shrink-0 items-center justify-center w-10 h-10 rounded-full ${ICON_STYLES[variant]}`;
  switch (variant) {
    case "rating":
      return (
        <div className={className} aria-hidden="true">
          <Star size={18} fill="currentColor" strokeWidth={0} />
        </div>
      );
    case "watched":
      return (
        <div className={className} aria-hidden="true">
          <Play size={18} fill="currentColor" strokeWidth={0} />
        </div>
      );
    case "review":
      return (
        <div className={className} aria-hidden="true">
          <Quote size={16} fill="currentColor" strokeWidth={0} />
        </div>
      );
    case "track":
      return (
        <div className={className} aria-hidden="true">
          <BookmarkPlus size={18} />
        </div>
      );
  }
}

function StarRow({ rating }: { rating: NonNullable<ActivityEvent["rating"]> }) {
  const filled = RATING_TO_STARS[rating];
  return (
    <div className="flex items-center gap-0.5 mt-1" aria-label={`${filled} of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={11}
          className={i < filled ? "text-amber-400" : "text-zinc-700"}
          fill="currentColor"
          strokeWidth={0}
        />
      ))}
    </div>
  );
}

function useRelativeTime(iso: string): string {
  const { t } = useTranslation();
  // Capture "now" once at mount. Relative labels are coarse (minutes/hours/days)
  // so a stale anchor by minutes is fine — refreshing on every render would also
  // be impure (Date.now is non-deterministic).
  const [now] = useState(() => Date.now());
  return useMemo(() => {
    // Treat naked SQLite timestamps like "2026-04-26 10:00:00" as UTC.
    const normalized = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
    const seconds = Math.max(0, (now - new Date(normalized).getTime()) / 1000);
    if (seconds < 60) return t("userProfile.dossier.activity.time.now");
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return t("userProfile.dossier.activity.time.minutes", { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("userProfile.dossier.activity.time.hours", { count: hours });
    const days = Math.floor(hours / 24);
    if (days < 7) return t("userProfile.dossier.activity.time.days", { count: days });
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return t("userProfile.dossier.activity.time.weeks", { count: weeks });
    const months = Math.floor(days / 30);
    if (months < 12) return t("userProfile.dossier.activity.time.months", { count: months });
    const years = Math.floor(days / 365);
    return t("userProfile.dossier.activity.time.years", { count: years });
  }, [iso, now, t]);
}

const BADGE_LABEL_KEY = {
  rating: "userProfile.dossier.activity.badge.rating",
  watched: "userProfile.dossier.activity.badge.watched",
  review: "userProfile.dossier.activity.badge.review",
  track: "userProfile.dossier.activity.badge.track",
} as const;

interface ActivityRowProps {
  event: ActivityEvent;
  isOwnProfile?: boolean;
  onHide?: (event: ActivityEvent) => void;
}

function ActivityRow({ event, isOwnProfile, onHide }: ActivityRowProps) {
  const { t } = useTranslation();
  const relative = useRelativeTime(event.created_at);
  const titleHref = `/title/${encodeURIComponent(event.title.id)}`;

  let badgeKey: keyof typeof BADGE_LABEL_KEY;
  let summary: string;
  let detail: React.ReactNode = null;

  switch (event.type) {
    case "rating_title": {
      badgeKey = "rating";
      summary = t("userProfile.dossier.activity.summary.ratedTitle", { title: event.title.title });
      if (event.rating) detail = <StarRow rating={event.rating} />;
      break;
    }
    case "rating_episode": {
      badgeKey = "rating";
      const epName = event.episode?.name ? ` · ${event.episode.name}` : "";
      summary = t("userProfile.dossier.activity.summary.ratedEpisode", {
        season: event.episode?.season_number ?? 0,
        episode: event.episode?.episode_number ?? 0,
        episodeName: epName,
      });
      if (event.rating) detail = <StarRow rating={event.rating} />;
      if (event.review) {
        detail = (
          <>
            {detail}
            <p className="mt-1 text-sm italic text-zinc-300">&ldquo;{event.review}&rdquo;</p>
          </>
        );
        badgeKey = "review";
      }
      break;
    }
    case "watched_title": {
      badgeKey = "watched";
      const runtime = event.title.runtime_minutes
        ? t("userProfile.dossier.activity.runtimeMinutes", { minutes: event.title.runtime_minutes })
        : "";
      summary = t("userProfile.dossier.activity.summary.watchedTitle", {
        title: event.title.title,
        runtime,
      });
      break;
    }
    case "watched_episode": {
      badgeKey = "watched";
      const epName = event.episode?.name ? ` · ${event.episode.name}` : "";
      const runtime = event.title.runtime_minutes
        ? t("userProfile.dossier.activity.runtimeMinutes", { minutes: event.title.runtime_minutes })
        : "";
      summary = t("userProfile.dossier.activity.summary.watchedEpisode", {
        season: event.episode?.season_number ?? 0,
        episode: event.episode?.episode_number ?? 0,
        episodeName: epName,
        runtime,
      });
      break;
    }
    case "tracked": {
      badgeKey = "track";
      if (event.status) {
        const statusLabel = t(STATUS_LABEL_KEY[event.status]).toLowerCase();
        summary = t("userProfile.dossier.activity.summary.trackedStatus", { status: statusLabel });
      } else {
        summary = t("userProfile.dossier.activity.summary.trackedDefault");
      }
      break;
    }
    case "recommendation": {
      badgeKey = "review";
      if (event.message) {
        summary = "";
        detail = <p className="mt-0.5 text-sm italic text-zinc-300">&ldquo;{event.message}&rdquo;</p>;
      } else {
        summary = t("userProfile.dossier.activity.summary.recommendationDefault", { title: event.title.title });
      }
      break;
    }
  }

  return (
    <li className="group flex items-start gap-3.5 py-3.5 border-b border-white/[0.04] last:border-b-0">
      <ActivityIcon type={event.type} />
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <Link
            to={titleHref}
            className="text-[15px] font-bold text-zinc-100 hover:text-amber-400 transition-colors truncate"
          >
            {event.title.title}
          </Link>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            {t(BADGE_LABEL_KEY[badgeKey])}
          </span>
        </div>
        {summary && <p className="text-[13px] text-zinc-400 mt-0.5 truncate">{summary}</p>}
        {detail}
      </div>
      <div className="flex items-center gap-2 shrink-0 pt-1">
        <span className="font-mono text-[11px] text-zinc-500">{relative}</span>
        {isOwnProfile && onHide && (
          <button
            type="button"
            aria-label={t("userProfile.dossier.activity.hideEvent")}
            onClick={() => onHide(event)}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-zinc-600 hover:text-zinc-300 transition-opacity"
          >
            <X size={13} />
          </button>
        )}
      </div>
    </li>
  );
}

export default function RecentActivityCard({ username, isOwnProfile, pageSize = 10, fetcher }: RecentActivityCardProps) {
  // Reset internal state when the username changes by remounting via key —
  // avoids the "setState in effect body" lint rule and makes cancellation
  // trivially correct.
  return (
    <ActivityFeed
      key={username}
      username={username}
      isOwnProfile={isOwnProfile}
      pageSize={pageSize}
      fetcher={fetcher ?? api.getUserActivity}
    />
  );
}

interface ActivityFeedProps {
  username: string;
  isOwnProfile?: boolean;
  pageSize: number;
  fetcher: ActivityFetcher;
}

function ActivityFeed({ username, isOwnProfile, pageSize, fetcher }: ActivityFeedProps) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetcher(username, { limit: pageSize })
      .then((res) => {
        if (controller.signal.aborted) return;
        setEvents(res.activities);
        setCursor(res.next_cursor);
        setHasMore(res.has_more);
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(true);
        setLoading(false);
      });
    return () => controller.abort();
  }, [username, pageSize, fetcher]);

  const handleHide = useCallback((event: ActivityEvent) => {
    setEvents((prev) => prev.filter((e) => e.id !== event.id));
    api.hideActivityEvent(event.type, event.id).catch(() => {
      setEvents((prev) =>
        [...prev, event].sort((a, b) => b.created_at.localeCompare(a.created_at)),
      );
    });
  }, []);

  const loadMore = useCallback(() => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    fetcher(username, { limit: pageSize, before: cursor })
      .then((res) => {
        setEvents((prev) => [...prev, ...res.activities]);
        setCursor(res.next_cursor);
        setHasMore(res.has_more);
        setLoadingMore(false);
      })
      .catch(() => {
        setError(true);
        setLoadingMore(false);
      });
  }, [username, pageSize, cursor, loadingMore, fetcher]);

  if (error) return null;

  return (
    <DossierCard padding="lg">
      <Kicker color="zinc">{t("userProfile.dossier.activity.title")}</Kicker>
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3.5 py-3.5">
              <div className="w-10 h-10 rounded-full bg-white/[0.04] animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 bg-white/[0.04] rounded animate-pulse" />
                <div className="h-3 w-2/3 bg-white/[0.04] rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-zinc-500 py-6 text-center">
          {t("userProfile.dossier.activity.empty")}
        </p>
      ) : (
        <>
          <ul className="-mt-1">
            {events.map((event) => (
              <ActivityRow
                key={event.id}
                event={event}
                isOwnProfile={isOwnProfile}
                onHide={handleHide}
              />
            ))}
          </ul>
          {hasMore && (
            <div className="text-center pt-3">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="text-sm font-semibold text-amber-400 hover:text-amber-300 disabled:opacity-50 transition-colors"
              >
                {loadingMore
                  ? t("userProfile.dossier.activity.loading")
                  : t("userProfile.dossier.activity.loadMore")}
              </button>
            </div>
          )}
        </>
      )}
    </DossierCard>
  );
}
