import { useParams, useSearchParams } from "react-router";
import { useAuth } from "../context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import * as api from "../api";
import type { Category, UserAchievement } from "../types";
import { Kicker } from "../components/design/Kicker";
import { NextUpStrip } from "../components/achievements/NextUpStrip";
import { RecentlyEarnedStrip } from "../components/achievements/RecentlyEarnedStrip";
import { CategoryFilter } from "../components/achievements/CategoryFilter";
import { BadgeGrid } from "../components/achievements/BadgeGrid";

const DISPLAY_ORDER: Category[] = [
  "watching",
  "streaks",
  "genres",
  "social",
  "special",
  "explorer",
  "habit",
  "long-haul",
];

const CATEGORY_LABELS: Record<Category, string> = {
  watching: "Watching",
  streaks: "Streaks",
  genres: "Genres",
  social: "Social",
  special: "Special",
  explorer: "Explorer",
  habit: "Habit",
  "long-haul": "Long Haul",
};

export default function AchievementsPage() {
  const { user } = useAuth();
  const { username } = useParams<{ username?: string }>();
  const [searchParams] = useSearchParams();

  const isOwnProfile = !username || user?.username === username;
  const mode: "self" | "other" = isOwnProfile ? "self" : "other";
  const baseHref = isOwnProfile
    ? "/achievements"
    : `/u/${username}/achievements`;
  const activeCategory = searchParams.get("cat") as Category | null;

  const {
    data,
    isLoading: loading,
    isError: error,
  } = useQuery({
    queryKey: ["achievements", username ?? "me"],
    queryFn: ({ signal }) =>
      isOwnProfile
        ? api.getMyAchievements(signal)
        : api.getUserAchievements(username!, signal),
  });

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="text-zinc-500 text-sm">Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="text-zinc-500 text-sm">
          Failed to load achievements.
        </div>
      </div>
    );
  }

  const achievements: UserAchievement[] = data ?? [];

  if (achievements.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-6">
        <div className="flex items-baseline justify-between">
          <Kicker color="zinc">Achievements</Kicker>
        </div>
        <div className="text-zinc-500 text-sm">No achievements yet.</div>
      </div>
    );
  }

  const earned = achievements.filter((a) => a.earned);
  const totalXp = earned.reduce((sum, a) => sum + a.points, 0);

  // Collect unique categories present in the data, in display order
  const presentCategorySet = new Set(achievements.map((a) => a.category));
  const presentCategories = DISPLAY_ORDER.filter((cat) =>
    presentCategorySet.has(cat),
  );

  // Categories to render: all or filtered
  const visibleCategories =
    activeCategory !== null
      ? presentCategories.filter((cat) => cat === activeCategory)
      : presentCategories;

  // Group achievements by category
  const byCategory = achievements.reduce<Record<string, UserAchievement[]>>(
    (acc, a) => {
      if (!acc[a.category]) acc[a.category] = [];
      acc[a.category].push(a);
      return acc;
    },
    {},
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <Kicker color="zinc">Achievements</Kicker>
        <span className="text-[11px] text-zinc-500 font-mono">
          {earned.length}/{achievements.length} earned · {totalXp} XP
        </span>
      </div>

      {/* Next up (self only) */}
      {isOwnProfile && (
        <section>
          <Kicker color="zinc" className="mb-2">
            Next up
          </Kicker>
          <NextUpStrip
            achievements={achievements}
            mode="self"
            baseHref={baseHref}
          />
        </section>
      )}

      {/* Recently earned */}
      {earned.length > 0 && (
        <section>
          <Kicker color="zinc" className="mb-2">
            Recently earned
          </Kicker>
          <RecentlyEarnedStrip
            achievements={achievements}
            mode={mode}
            baseHref={baseHref}
          />
        </section>
      )}

      {/* Category filter */}
      <CategoryFilter categories={presentCategories} />

      {/* Category-grouped grids */}
      {DISPLAY_ORDER.filter((cat) => visibleCategories.includes(cat)).map(
        (cat) => {
          const catAchievements = byCategory[cat];
          if (!catAchievements || catAchievements.length === 0) return null;
          return (
            <section key={cat}>
              <Kicker color="zinc" className="mb-2">
                {CATEGORY_LABELS[cat]}
              </Kicker>
              <BadgeGrid
                achievements={catAchievements}
                mode={mode}
                baseHref={baseHref}
              />
            </section>
          );
        },
      )}
    </div>
  );
}
