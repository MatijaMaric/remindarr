import { useState, useEffect, useRef } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Settings, Bookmark, Film, Tv } from "lucide-react";
import type { ProfileBackdrop, UserProfileUser, UserProfileStats } from "../types";

interface ProfileBannerProps {
  backdrops: ProfileBackdrop[];
  user: UserProfileUser;
  stats: UserProfileStats;
  isOwnProfile: boolean;
  /** Auto-advance interval in ms (default 8000). Exposed for testing. */
  autoAdvanceMs?: number;
}

export default function ProfileBanner({ backdrops, user, stats, isOwnProfile, autoAdvanceMs = 8000 }: ProfileBannerProps) {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const displayName = user.display_name || user.username;

  // Auto-advance every 8 seconds
  useEffect(() => {
    if (backdrops.length <= 1 || isPaused) return;
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % backdrops.length);
    }, autoAdvanceMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [backdrops.length, isPaused, autoAdvanceMs]);

  return (
    <div
      className="w-[100vw] relative left-[50%] ml-[-50vw] overflow-hidden h-[28rem] sm:h-[22rem] -mt-6"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Backdrop images with crossfade */}
      {backdrops.length > 0 ? (
        backdrops.map((b, i) => (
          <Link
            key={b.id}
            to={`/title/${b.id}`}
            className="absolute inset-0 transition-opacity duration-700"
            style={{ opacity: i === activeIndex ? 1 : 0, pointerEvents: i === activeIndex ? "auto" : "none" }}
            aria-hidden={i !== activeIndex}
            tabIndex={i === activeIndex ? 0 : -1}
          >
            <img
              src={b.backdrop_url}
              alt={b.title}
              className="w-full h-full object-cover"
              loading={i === 0 ? "eager" : "lazy"}
            />
          </Link>
        ))
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-950" data-testid="fallback-bg" />
      )}

      {/* Dark gradient overlay for text contrast */}
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent pointer-events-none" />

      {/* Settings button (top-right) */}
      {isOwnProfile && (
        <Link
          to="/settings"
          className="absolute top-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-300 hover:text-amber-400 bg-zinc-900/60 hover:bg-zinc-900/80 backdrop-blur-sm rounded-lg transition-colors"
          data-testid="settings-link"
        >
          <Settings className="size-4" />
          {t("userProfile.editSettings")}
        </Link>
      )}

      {/* Bottom overlay: user info (left) + stats (right) */}
      <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4">
          {/* User info */}
          <div className="pointer-events-auto min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-white truncate" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
              {displayName}
            </h1>
            {user.display_name && user.display_name !== user.username && (
              <p className="text-zinc-300 text-sm mt-0.5" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
                @{user.username}
              </p>
            )}
            {user.member_since && (
              <p className="text-zinc-400 text-sm mt-1" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
                {t("userProfile.memberSince", {
                  date: new Date(user.member_since).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                  }),
                })}
              </p>
            )}
          </div>

          {/* Stats */}
          <div className="pointer-events-auto shrink-0 flex flex-col items-stretch sm:items-end gap-2" data-testid="profile-stats">
            <div className="flex justify-center sm:justify-end gap-2 sm:gap-3">
              <div className="bg-zinc-900/70 backdrop-blur-sm rounded-lg px-3 py-2 text-center min-w-[4.5rem]">
                <Bookmark className="size-4 text-zinc-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-white leading-tight">{stats.tracked_count}</p>
                <p className="text-[10px] text-zinc-400 mt-0.5">{t("userProfile.trackedTitles")}</p>
              </div>
              <div className="bg-zinc-900/70 backdrop-blur-sm rounded-lg px-3 py-2 text-center min-w-[4.5rem]">
                <Film className="size-4 text-zinc-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-white leading-tight">{stats.watched_movies}</p>
                <p className="text-[10px] text-zinc-400 mt-0.5">{t("userProfile.watchedMovies")}</p>
              </div>
              <div className="bg-zinc-900/70 backdrop-blur-sm rounded-lg px-3 py-2 text-center min-w-[4.5rem]">
                <Tv className="size-4 text-zinc-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-white leading-tight">{stats.watched_episodes}</p>
                <p className="text-[10px] text-zinc-400 mt-0.5">{t("userProfile.watchedEpisodes")}</p>
              </div>
            </div>
            {stats.shows_total > 0 && (
              <div className="bg-zinc-900/70 backdrop-blur-sm rounded-lg px-3 py-2 w-full space-y-1.5" data-testid="progress-section">
                <div>
                  <div className="flex justify-between items-baseline mb-0.5">
                    <p className="text-[10px] text-zinc-400">{t("userProfile.showsCompleted")}</p>
                    <p className="text-[10px] text-zinc-300 font-medium">{stats.shows_completed}/{stats.shows_total}</p>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-700 overflow-hidden" data-testid="shows-progress-bar">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all"
                      style={{ width: `${Math.round((stats.shows_completed / stats.shows_total) * 100)}%` }}
                      data-testid="shows-progress-fill"
                    />
                  </div>
                </div>
                {stats.total_released_episodes > 0 && (
                  <div>
                    <div className="flex justify-between items-baseline mb-0.5">
                      <p className="text-[10px] text-zinc-400">{t("userProfile.episodesWatched")}</p>
                      <p className="text-[10px] text-zinc-300 font-medium">{stats.total_watched_episodes}/{stats.total_released_episodes}</p>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-700 overflow-hidden" data-testid="episodes-progress-bar">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all"
                        style={{ width: `${Math.round((stats.total_watched_episodes / stats.total_released_episodes) * 100)}%` }}
                        data-testid="episodes-progress-fill"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
