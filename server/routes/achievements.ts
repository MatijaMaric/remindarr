import { Hono } from "hono";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { getDb } from "../db/schema";
import { ACHIEVEMENTS, ACHIEVEMENT_META } from "../achievements/definitions";
import type { Achievement, AchievementMeta } from "../achievements/definitions";
import { getUserAchievements, getEarnHistory, getRarityForKey } from "../db/repository/achievements";
import { getStreak } from "../db/repository/streaks";
import { getUserVisibilityByUsername } from "../db/repository/profile";
import { isFollowing } from "../db/repository/follows";
import type { AppEnv } from "../types";
import { ok, err } from "./response";
import { zValidator } from "../lib/validator";
import { requireAuth } from "../middleware/auth";
import { traceDbQuery } from "../tracing";

function enrichWithMeta(_a: Achievement | undefined, meta: AchievementMeta | undefined) {
  return {
    category: meta?.category ?? "watching",
    family: meta?.family ?? null,
    rungIndex: meta?.rungIndex ?? null,
    tier: meta?.tier ?? "one-shot" as const,
    repeatable: meta?.repeatable ?? false,
  };
}

// ─── Achievements sub-app (mounted at /api/achievements) ────────────────────

const achievementsApp = new Hono<AppEnv>();

const usernameSchema = z.object({
  username: z.string().min(1).max(50),
});

// GET / — Public registry (no auth required)
achievementsApp.get("/", (c) => {
  const achievements = ACHIEVEMENTS.map((a) => ({
    ...a,
    ...enrichWithMeta(a, ACHIEVEMENT_META.get(a.key)),
  }));
  return ok(c, { achievements });
});

// GET /me — User's merged progress (auth required)
achievementsApp.get("/me", requireAuth, async (c) => {
  const user = c.get("user")!;
  const userRows = await getUserAchievements(user.id);

  const progressMap = new Map(userRows.map((r) => [r.achievementKey, r]));

  const result = ACHIEVEMENTS.map((a) => {
    const row = progressMap.get(a.key);
    const earnedAt = row?.earnedAt ?? null;
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
      earned: earnedAt != null,
      earnedAt,
      ...enrichWithMeta(a, ACHIEVEMENT_META.get(a.key)),
      earnedCount: row?.earnedCount || (earnedAt != null ? 1 : 0),
      lastEarnedAt: row?.lastEarnedAt ?? earnedAt,
      nextRung: null,
      rarity: null,
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
        ...enrichWithMeta(def, ACHIEVEMENT_META.get(r.achievementKey)),
      };
    });

  return ok(c, { achievements: earned });
});

// GET /:key/me — Achievement detail for own profile (auth required)
const keySchema = z.object({
  key: z.string().min(1).max(80).regex(/^[a-z0-9_]+$/),
});

achievementsApp.get("/:key/me", requireAuth, zValidator("param", keySchema), async (c) => {
  const user = c.get("user")!;
  const { key } = c.req.valid("param");

  const def = ACHIEVEMENTS.find((a) => a.key === key);
  if (!def) return err(c, "Achievement not found", 404);

  const meta = ACHIEVEMENT_META.get(key);
  const userRows = await getUserAchievements(user.id);
  const row = userRows.find((r) => r.achievementKey === key);
  const earnedAt = row?.earnedAt ?? null;

  // Build ladder rungs if this is a ladder achievement
  let ladder: { rungs: Array<{ key: string; title: string; threshold: number; rungIndex: number; points: number; earned: boolean; earnedAt: string | null }> } | null = null;
  if (meta?.family) {
    const familyAchievements = ACHIEVEMENTS
      .filter((a) => {
        const m = ACHIEVEMENT_META.get(a.key);
        return m?.family === meta.family;
      })
      .sort((a, b) => {
        const ma = ACHIEVEMENT_META.get(a.key);
        const mb = ACHIEVEMENT_META.get(b.key);
        return (ma?.rungIndex ?? 0) - (mb?.rungIndex ?? 0);
      });

    const earnedKeys = new Set(userRows.filter((r) => r.earnedAt != null).map((r) => r.achievementKey));
    ladder = {
      rungs: familyAchievements.map((a) => ({
        key: a.key,
        title: a.title,
        threshold: a.threshold,
        rungIndex: ACHIEVEMENT_META.get(a.key)?.rungIndex ?? 0,
        points: a.points,
        earned: earnedKeys.has(a.key),
        earnedAt: userRows.find((r) => r.achievementKey === a.key)?.earnedAt ?? null,
      })),
    };
  }

  // Earn history for repeatables
  const history = def.repeatable
    ? await getEarnHistory(user.id, key, 12)
    : [];

  // Rarity for one-shots only
  const rarity = meta?.tier === "one-shot" ? await getRarityForKey(key) : null;

  return ok(c, {
    key: def.key,
    kind: def.kind,
    title: def.title,
    description: def.description,
    icon: def.icon,
    threshold: def.threshold,
    points: def.points,
    progress: row?.progress ?? 0,
    earned: earnedAt != null,
    earnedAt,
    earnedCount: row?.earnedCount ?? (earnedAt != null ? 1 : 0),
    lastEarnedAt: row?.lastEarnedAt ?? earnedAt,
    ...enrichWithMeta(def, meta),
    rarity,
    ladder,
    history: history.map((h) => ({
      earnedAt: h.earnedAt,
      context: h.context ? JSON.parse(h.context) : null,
    })),
  });
});

// GET /u/:username/:key — Achievement detail for another user (auth required, privacy gated)
const usernameKeySchema = z.object({
  username: z.string().min(1).max(50),
  key: z.string().min(1).max(80).regex(/^[a-z0-9_]+$/),
});

achievementsApp.get("/u/:username/:key", requireAuth, zValidator("param", usernameKeySchema), async (c) => {
  const requester = c.get("user")!;
  const { username, key } = c.req.valid("param");

  const def = ACHIEVEMENTS.find((a) => a.key === key);
  if (!def) return err(c, "Achievement not found", 404);

  const profileUser = await getUserVisibilityByUsername(username);
  if (!profileUser) return err(c, "User not found", 404);

  if (profileUser.visibility === "private") return err(c, "User not found", 404);

  if (profileUser.visibility === "friends_only" && profileUser.id !== requester.id) {
    const following = await isFollowing(requester.id, profileUser.id);
    if (!following) return err(c, "Access denied", 403);
  }

  const meta = ACHIEVEMENT_META.get(key);
  const userRows = await getUserAchievements(profileUser.id);
  const row = userRows.find((r) => r.achievementKey === key && r.earnedAt != null);

  const rarity = meta?.tier === "one-shot" ? await getRarityForKey(key) : null;

  return ok(c, {
    key: def.key,
    kind: def.kind,
    title: def.title,
    description: def.description,
    icon: def.icon,
    threshold: def.threshold,
    points: def.points,
    earned: row != null,
    earnedAt: row?.earnedAt ?? null,
    earnedCount: row?.earnedCount ?? (row != null ? 1 : 0),
    lastEarnedAt: row?.lastEarnedAt ?? null,
    ...enrichWithMeta(def, meta),
    rarity,
    ladder: null,
    history: [],
  });
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
