import { useCallback, useMemo, useState } from "react";
import { Card } from "../components/ui/card";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import * as api from "../api";
import type { PinnedTitle } from "../types";
import { useAuth } from "../context/AuthContext";
import ProfileHero from "../components/profile/ProfileHero";
import BioCard from "../components/profile/BioCard";
import PinnedFavoritesCard from "../components/PinnedFavoritesCard";
import ProgressCard from "../components/profile/ProgressCard";
import TopGenresCard from "../components/profile/TopGenresCard";
import FriendsCard from "../components/profile/FriendsCard";
import MonthlyActivityCard from "../components/profile/MonthlyActivityCard";
import RecentActivityCard from "../components/profile/RecentActivityCard";
import StatusBreakdown from "../components/profile/StatusBreakdown";
import WatchlistTabs, {
  useWatchlistFilters,
  type WatchlistTab,
} from "../components/profile/WatchlistTabs";
import WatchlistGrid from "../components/profile/WatchlistGrid";
import { TitleGridSkeleton } from "../components/SkeletonComponents";
import { useApiCall } from "../hooks/useApiCall";

export default function UserProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const { data, loading, error, refetch } = useApiCall(
    (signal) => api.getUserProfile(username!, signal),
    [username],
  );

  const [followerAdjust, setFollowerAdjust] = useState(0);
  const [activeTab, setActiveTab] = useState<WatchlistTab>("watching");
  const [localBio, setLocalBio] = useState<string | null | undefined>(undefined);
  const [localPinned, setLocalPinned] = useState<PinnedTitle[] | null>(null);

  const handleFollowToggle = useCallback((isNowFollowing: boolean) => {
    setFollowerAdjust((prev) => prev + (isNowFollowing ? 1 : -1));
  }, []);

  const shows = useMemo(() => data?.shows ?? [], [data]);
  const movies = useMemo(() => data?.movies ?? [], [data]);
  const { counts, lists } = useWatchlistFilters(shows, movies);

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="h-[360px] bg-zinc-900 animate-pulse rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8 max-w-7xl mx-auto px-4">
          <div className="space-y-4">
            <div className="h-24 bg-zinc-900 animate-pulse rounded-xl" />
            <div className="h-64 bg-zinc-900 animate-pulse rounded-xl" />
          </div>
          <TitleGridSkeleton />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <p className="text-zinc-400 text-lg">{t("userProfile.userNotFound")}</p>
      </div>
    );
  }

  const {
    user,
    overview,
    genres,
    monthly,
    shows_by_status,
    friends,
    is_own_profile,
    show_watchlist,
    activity_stream_enabled,
    profile_visibility,
    backdrops,
    follower_count,
    following_count,
    is_following,
    pinned,
  } = data;

  const bio = localBio === undefined ? user.bio : localBio;
  const pinnedDisplay = localPinned ?? pinned;
  const displayedFollowerCount = follower_count + followerAdjust;
  const activeList = lists[activeTab];

  const showWatchTogether = !!currentUser && !is_own_profile;

  return (
    <div className="space-y-8">
      <ProfileHero
        user={{ ...user, bio }}
        backdrops={backdrops}
        followerCount={displayedFollowerCount}
        followingCount={following_count}
        isFollowing={is_following}
        isOwnProfile={is_own_profile}
        onFollowToggle={handleFollowToggle}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-10">
          {/* Sidebar */}
          <aside className="flex flex-col gap-4 min-w-0">
            {showWatchTogether && (
              <Link
                to={`/u/${currentUser.username}/overlap/${user.username}`}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-colors"
              >
                {t("userProfile.watchTogether", "Watch together")}
              </Link>
            )}
            <BioCard
              bio={bio}
              isOwnProfile={is_own_profile}
              onBioUpdated={(next) => {
                setLocalBio(next);
                refetch();
              }}
            />
            {(pinnedDisplay.length > 0 || is_own_profile) && (
              <PinnedFavoritesCard
                pinned={pinnedDisplay}
                isOwnProfile={is_own_profile}
                onPinnedChanged={(next) => setLocalPinned(next)}
              />
            )}
            {show_watchlist && <ProgressCard overview={overview} />}
            {show_watchlist && genres.length > 0 && <TopGenresCard genres={genres} limit={6} />}
            {show_watchlist && friends.length > 0 && (
              <FriendsCard
                friends={friends}
                profileUsername={user.username}
                totalFriends={friends.length}
              />
            )}
          </aside>

          {/* Main column */}
          <main className="flex flex-col gap-4 min-w-0">
            {show_watchlist ? (
              <>
                {monthly.length > 0 && <MonthlyActivityCard monthly={monthly} />}
                <StatusBreakdown byStatus={shows_by_status} />
                {(is_own_profile || activity_stream_enabled) && (
                  <RecentActivityCard username={user.username} isOwnProfile={is_own_profile} />
                )}
                <WatchlistTabs
                  active={activeTab}
                  onChange={setActiveTab}
                  counts={counts}
                />
                <WatchlistGrid titles={activeList} />
              </>
            ) : (
              <Card padding="xl" className="text-center">
                <p className="text-zinc-400">
                  {is_own_profile
                    ? t("userProfile.watchlistHiddenOwn")
                    : profile_visibility === "friends_only"
                      ? t("userProfile.watchlistFriendsOnly")
                      : t("userProfile.watchlistHidden")}
                </p>
                {is_own_profile && (
                  <Link
                    to="/settings"
                    className="inline-block mt-3 text-amber-400 hover:text-amber-300 text-sm"
                  >
                    {t("userProfile.enableInSettings")}
                  </Link>
                )}
              </Card>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
