import { Hono } from "hono";
import { z } from "zod";
import {
  getUnwatchedEpisodes,
  getNextUnwatchedEpisode,
  getLastWatchedAtPerShow,
  getDiscoveryFeed,
} from "../db/repository";
import { zValidator } from "../lib/validator";
import { logger } from "../logger";
import type { AppEnv } from "../types";
import { ok } from "./response";

const log = logger.child({ module: "up-next" });

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(50).default(12),
});

export interface UpNextItem {
  kind: "in_progress" | "newly_aired" | "recommendation";
  titleId: number;
  title: string;
  posterUrl: string | null;
  // Episode fields (in_progress / newly_aired)
  nextEpisodeId?: number;
  nextEpisodeTitle?: string;
  nextEpisodeSeason?: number;
  nextEpisodeNumber?: number;
  nextEpisodeAirDate?: string;
  unwatchedCount?: number;
  // Recommendation fields
  recommendedBy?: string;
  recommendationId?: number;
}

const app = new Hono<AppEnv>();

app.get("/", zValidator("query", querySchema), async (c) => {
  const user = c.get("user")!;
  const { limit } = c.req.valid("query");

  const timezone = c.req.header("X-Timezone") || "UTC";

  log.debug("Building up-next queue", { userId: user.id, limit });

  // 1. Fetch all unwatched aired episodes for the user.
  const unwatchedRows = await getUnwatchedEpisodes(user.id, timezone);

  // Group by titleId so we can determine in-progress vs newly-aired.
  const byTitle = new Map<
    string,
    { watchedCount: number; totalEpisodes: number; title: string; posterUrl: string | null; rows: typeof unwatchedRows }
  >();

  for (const row of unwatchedRows) {
    if (!byTitle.has(row.title_id)) {
      byTitle.set(row.title_id, {
        watchedCount: row.watched_episodes_count,
        totalEpisodes: row.total_episodes,
        title: row.show_title,
        posterUrl: row.poster_url,
        rows: [],
      });
    }
    byTitle.get(row.title_id)!.rows.push(row);
  }

  // 2. Separate into in-progress (watched > 0) and newly-aired (watched === 0).
  const inProgressTitleIds: string[] = [];
  const newlyAiredTitleIds: string[] = [];

  for (const [titleId, entry] of byTitle) {
    if (entry.watchedCount > 0) {
      inProgressTitleIds.push(titleId);
    } else {
      newlyAiredTitleIds.push(titleId);
    }
  }

  // 3. Sort in-progress by most recently watched.
  const lastWatchedMap = await getLastWatchedAtPerShow(user.id);

  inProgressTitleIds.sort((a, b) => {
    const aDate = lastWatchedMap.get(a)?.getTime() ?? 0;
    const bDate = lastWatchedMap.get(b)?.getTime() ?? 0;
    return bDate - aDate;
  });

  // 4. Build result items.
  const items: UpNextItem[] = [];
  const seen = new Set<string>();

  // In-progress shows first.
  for (const titleId of inProgressTitleIds) {
    if (items.length >= limit) break;
    if (seen.has(titleId)) continue;
    seen.add(titleId);

    const entry = byTitle.get(titleId)!;
    const numericTitleId = parseInt(titleId, 10);

    // Find the actual next episode to watch.
    const nextEp = await getNextUnwatchedEpisode(user.id, titleId, timezone);

    items.push({
      kind: "in_progress",
      titleId: numericTitleId,
      title: entry.title,
      posterUrl: entry.posterUrl,
      nextEpisodeId: nextEp?.id,
      nextEpisodeTitle: nextEp?.name ?? undefined,
      nextEpisodeSeason: nextEp?.season_number,
      nextEpisodeNumber: nextEp?.episode_number,
      nextEpisodeAirDate: nextEp?.air_date ?? undefined,
      unwatchedCount: entry.rows.length,
    });
  }

  // Newly-aired shows next.
  for (const titleId of newlyAiredTitleIds) {
    if (items.length >= limit) break;
    if (seen.has(titleId)) continue;
    seen.add(titleId);

    const entry = byTitle.get(titleId)!;
    const numericTitleId = parseInt(titleId, 10);

    const nextEp = await getNextUnwatchedEpisode(user.id, titleId, timezone);

    items.push({
      kind: "newly_aired",
      titleId: numericTitleId,
      title: entry.title,
      posterUrl: entry.posterUrl,
      nextEpisodeId: nextEp?.id,
      nextEpisodeTitle: nextEp?.name ?? undefined,
      nextEpisodeSeason: nextEp?.season_number,
      nextEpisodeNumber: nextEp?.episode_number,
      nextEpisodeAirDate: nextEp?.air_date ?? undefined,
      unwatchedCount: entry.rows.length,
    });
  }

  // 5. Append one recommendation if there is room.
  if (items.length < limit) {
    try {
      const recFeed = await getDiscoveryFeed(user.id, 1, 0);
      if (recFeed.length > 0) {
        const rec = recFeed[0];
        const recTitleIdStr = String(rec.titleId);
        if (!seen.has(recTitleIdStr)) {
          seen.add(recTitleIdStr);
          const numericTitleId = parseInt(recTitleIdStr, 10);
          items.push({
            kind: "recommendation",
            titleId: numericTitleId,
            title: rec.titleName,
            posterUrl: rec.posterUrl,
            recommendedBy: rec.fromUsername,
            recommendationId: rec.id as unknown as number,
          });
        }
      }
    } catch (err) {
      log.warn("Failed to fetch recommendation for up-next queue", {
        userId: user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return ok(c, { items });
});

export default app;
