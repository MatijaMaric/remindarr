import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Settings } from "lucide-react";
import * as api from "../api";
import TitleList from "../components/TitleList";
import { TitleGridSkeleton } from "../components/SkeletonComponents";
import { useApiCall } from "../hooks/useApiCall";

export default function UserProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { t } = useTranslation();
  const { data, loading, error, refetch } = useApiCall(
    () => api.getUserProfile(username!),
    [username],
  );

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-zinc-800 rounded" />
          <div className="h-4 w-32 bg-zinc-800 rounded" />
          <div className="grid grid-cols-3 gap-4">
            <div className="h-20 bg-zinc-800 rounded-lg" />
            <div className="h-20 bg-zinc-800 rounded-lg" />
            <div className="h-20 bg-zinc-800 rounded-lg" />
          </div>
        </div>
        <TitleGridSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto py-12 text-center">
        <p className="text-zinc-400 text-lg">{t("userProfile.userNotFound")}</p>
      </div>
    );
  }

  const { user, stats, titles, is_own_profile, show_watchlist } = data;
  const displayName = user.display_name || user.username;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{displayName}</h1>
          {user.display_name && (
            <p className="text-zinc-400 text-sm">@{user.username}</p>
          )}
          {user.member_since && (
            <p className="text-zinc-500 text-sm mt-1">
              {t("userProfile.memberSince", {
                date: new Date(user.member_since).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                }),
              })}
            </p>
          )}
        </div>
        {is_own_profile && (
          <Link
            to="/settings"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
          >
            <Settings className="size-4" />
            {t("userProfile.editSettings")}
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-zinc-900 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-white">{stats.tracked_count}</p>
          <p className="text-xs text-zinc-400 mt-1">{t("userProfile.trackedTitles")}</p>
        </div>
        <div className="bg-zinc-900 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-white">{stats.watched_movies}</p>
          <p className="text-xs text-zinc-400 mt-1">{t("userProfile.watchedMovies")}</p>
        </div>
        <div className="bg-zinc-900 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-white">{stats.watched_episodes}</p>
          <p className="text-xs text-zinc-400 mt-1">{t("userProfile.watchedEpisodes")}</p>
        </div>
      </div>

      {/* Watchlist */}
      {show_watchlist && titles.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">{t("userProfile.watchlist")}</h2>
          <TitleList
            titles={titles}
            onTrackToggle={refetch}
            emptyMessage={t("userProfile.noTitles")}
          />
        </div>
      )}

      {show_watchlist && titles.length === 0 && (
        <p className="text-zinc-500 text-center py-8">{t("userProfile.noTitles")}</p>
      )}

      {!show_watchlist && !is_own_profile && (
        <p className="text-zinc-500 text-center py-8">{t("userProfile.watchlistHidden")}</p>
      )}

      {!show_watchlist && is_own_profile && (
        <div className="text-center py-8">
          <p className="text-zinc-500">{t("userProfile.watchlistHiddenOwn")}</p>
          <Link to="/settings" className="text-amber-500 hover:text-amber-400 text-sm mt-2 inline-block">
            {t("userProfile.enableInSettings")}
          </Link>
        </div>
      )}
    </div>
  );
}
