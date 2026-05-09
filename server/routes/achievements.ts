import { Hono } from "hono";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { getDb } from "../db/schema";
import { ACHIEVEMENTS } from "../achievements/definitions";
import { getUserAchievements } from "../db/repository/achievements";
import { getStreak } from "../db/repository/streaks";
import { getUserVisibilityByUsername } from "../db/repository/profile";
import { isFollowing } from "../db/repository/follows";
import type { AppEnv } from "../types";
import { ok, err } from "./response";
import { zValidator } from "../lib/validator";
import { requireAuth } from "../middleware/auth";
import { traceDbQuery } from "../tracing";

// ─── Achievements sub-app (mounted at /api/achievements) ────────────────────

const achievementsApp = new Hono<AppEnv>();

const usernameSchema = z.object({
  username: z.string().min(1).max(50),
});

// GET / — Public registry (no auth required)
achievementsApp.get("/", (c) => {
  return ok(c, { achievements: ACHIEVEMENTS });
});

// GET /me — User's merged progress (auth required)
achievementsApp.get("/me", requireAuth, async (c) => {
  const user = c.get("user")!;
  const userRows = await getUserAchievements(user.id);

  const progressMap = new Map(userRows.map((r) => [r.achievementKey, r]));

  const result = ACHIEVEMENTS.map((a) => {
    const row = progressMap.get(a.key);
    return {
      key: a.key,
      kind: a.kind,
      title: a.title,
      description: a.description,
      icon: a.icon,
      threshold: a.threshold,
      points: a.points,
      genre: a.genre,
      windowHours: a.windowHours,
      progress: row?.progress ?? 0,
      earned: row?.earnedAt != null,
      earnedAt: row?.earnedAt ?? null,
    };
  });

  return ok(c, { achievements: result });
});

// GET /u/:username — Another user's earned achievements (privacy gated)
achievementsApp.get("/u/:username", requireAuth, zValidator("param", usernameSchema), async (c) => {
  const requester = c.get("user")!;
  const { username } = c.req.valid("param");

  const profileUser = await getUserVisibilityByUsername(username);
  if (!profileUser) {
    return err(c, "User not found", 404);
  }

  // Privacy gate
  if (profileUser.visibility === "private") {
    return err(c, "User not found", 404);
  }

  if (profileUser.visibility === "friends_only") {
    // Own profile passes the friends_only check
    if (profileUser.id !== requester.id) {
      const following = await isFollowing(requester.id, profileUser.id);
      if (!following) {
        return err(c, "Access denied", 403);
      }
    }
  }

  const userRows = await getUserAchievements(profileUser.id);
  const earned = userRows
    .filter((r) => r.earnedAt != null)
    .map((r) => {
      const def = ACHIEVEMENTS.find((a) => a.key === r.achievementKey);
      return {
        key: r.achievementKey,
        kind: def?.kind ?? "count_movies",
        title: def?.title ?? r.achievementKey,
        description: def?.description ?? "",
        icon: def?.icon ?? "",
        threshold: def?.threshold ?? 0,
        points: def?.points ?? 0,
        genre: def?.genre,
        windowHours: def?.windowHours,
        // Progress hidden for other users — only earned status shown
        earned: true,
        earnedAt: r.earnedAt,
      };
    });

  return ok(c, { achievements: earned });
});

export default achievementsApp;

// ─── Leaderboard sub-app (mounted at /api/leaderboard) ──────────────────────

export const leaderboardApp = new Hono<AppEnv>();

leaderboardApp.get("/", requireAuth, async (c) => {
  const user = c.get("user")!;

  const entries = await traceDbQuery("leaderboard", async () => {
    const db = getDb();
    return await db.all<{
      id: string;
      username: string;
      name: string | null;
      image: string | null;
      xp: number;
      badge_count: number;
    }>(sql`
      WITH friend_set AS (
        SELECT following_id AS id FROM follows WHERE follower_id = ${user.id}
        UNION SELECT ${user.id}
      )
      SELECT u.id, u.username, u.name, u.image,
        COALESCE(SUM(a.points), 0) AS xp,
        COUNT(ua.achievement_key) AS badge_count
      FROM friend_set fs
      JOIN users u ON u.id = fs.id
      LEFT JOIN user_achievements ua ON ua.user_id = u.id AND ua.earned_at IS NOT NULL
      LEFT JOIN achievements a ON a.key = ua.achievement_key
      GROUP BY u.id
      ORDER BY xp DESC, badge_count DESC
      LIMIT 50
    `);
  });

  const leaderboard = entries.map((row, idx) => ({
    userId: row.id,
    username: row.username,
    name: row.name,
    image: row.image,
    xp: Number(row.xp),
    badgeCount: Number(row.badge_count),
    rank: idx + 1,
  }));

  return ok(c, { entries: leaderboard });
});

// ─── Streak sub-app (mounted at /api/streak) ────────────────────────────────

export const streakApp = new Hono<AppEnv>();

streakApp.get("/me", requireAuth, async (c) => {
  const user = c.get("user")!;
  const streak = await getStreak(user.id);

  return ok(c, {
    currentStreak: streak?.currentStreak ?? 0,
    longestStreak: streak?.longestStreak ?? 0,
    lastWatchDate: streak?.lastWatchDate ?? null,
  });
});
