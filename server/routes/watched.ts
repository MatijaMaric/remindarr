import { Hono } from "hono";
import { z } from "zod";
import {
  watchEpisode, unwatchEpisode, watchEpisodesBulk, unwatchEpisodesBulk,
  getEpisodeAirDate, getReleasedEpisodeIds, getReleasedEpisodesWithAirDate,
  watchTitle, unwatchTitle, getEpisodeTitleId, getEpisodeTitleIds,
  backdateWatchedEpisodesToAirDate,
  setWatchedTitleWatchedAt, setWatchedEpisodeWatchedAt,
} from "../db/repository";
import { logWatch, getTitlePlayCount, getTitleWatchHistory, getWatchHistoryById, updateWatchHistoryWatchedAt, getLatestWatchHistoryFor } from "../db/repository/watch-history";
import { localDateForTimezone } from "../utils/timezone";
import type { AppEnv } from "../types";
import { ok, err } from "./response";
import { zValidator } from "../lib/validator";
import { onWatchedTitle, onWatchedEpisode, onWatchedEpisodesBulk } from "../achievements/triggers";
import { MemoryRateLimitStore } from "../middleware/rate-limit";
import { logger } from "../logger";

const app = new Hono<AppEnv>();

const log = logger.child({ module: "watched" });

const editHistorySchema = z.object({
  watched_at: z.string().regex(/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/),
});

let _watchedEditStore: MemoryRateLimitStore | null = null;
function getWatchedEditStore(): MemoryRateLimitStore {
  if (!_watchedEditStore) _watchedEditStore = new MemoryRateLimitStore();
  return _watchedEditStore;
}

function isReleased(airDate: string | null, timezone: string): boolean {
  if (!airDate) return false;
  const today = localDateForTimezone(timezone);
  return airDate <= today;
}

// SQLite stores `watched_at` as text via `datetime('now')`, format `YYYY-MM-DD HH:MM:SS`.
// Match that shape so monthly stats grouping (`strftime('%Y-%m', watched_at)`) works.
function airDateToWatchedAt(airDate: string): string {
  return `${airDate} 00:00:00`;
}

const bulkWatchedSchema = z.object({
  episodeIds: z.array(z.number().int()).min(1, "episodeIds must be a non-empty array"),
  watched: z.boolean(),
  useAirDate: z.boolean().optional(),
});

app.post("/bulk", zValidator("json", bulkWatchedSchema), async (c) => {
  const user = c.get("user")!;
  const timezone = c.req.header("X-Timezone") || "UTC";
  const { episodeIds, watched, useAirDate } = c.req.valid("json");

  if (watched) {
    let releasedIds: number[];
    let watchedAtByEpisodeId: Map<number, string> | undefined;

    if (useAirDate) {
      const released = await getReleasedEpisodesWithAirDate(episodeIds, timezone);
      releasedIds = released.map((r) => r.id);
      watchedAtByEpisodeId = new Map(released.map((r) => [r.id, airDateToWatchedAt(r.airDate)]));
    } else {
      releasedIds = await getReleasedEpisodeIds(episodeIds, timezone);
    }

    if (releasedIds.length === 0) {
      return err(c, "Cannot mark unreleased episodes as watched");
    }
    await watchEpisodesBulk(releasedIds, user.id, watchedAtByEpisodeId);

    // Log watch history for each released episode
    const titleIdMap = await getEpisodeTitleIds(releasedIds);
    for (const episodeId of releasedIds) {
      const titleId = titleIdMap.get(episodeId);
      if (titleId) {
        await logWatch(user.id, titleId, episodeId, watchedAtByEpisodeId?.get(episodeId));
      }
    }

    // Trigger achievement evaluation for bulk episode watch
    const distinctTitleIds = new Set(
      releasedIds
        .map((id) => titleIdMap.get(id))
        .filter((id): id is string => id != null)
    );
    const watchedAt = watchedAtByEpisodeId?.get(releasedIds[0]);
    await onWatchedEpisodesBulk(
      user.id,
      releasedIds.map(String),
      distinctTitleIds,
      watchedAt
    );
  } else {
    // Achievements are sticky — deletes do not undo progress or earned badges.
    await unwatchEpisodesBulk(episodeIds, user.id);
  }

  return ok(c, {});
});

const backdateSchema = z.object({
  titleId: z.string().min(1).optional(),
});

app.post("/backdate", zValidator("json", backdateSchema), async (c) => {
  const user = c.get("user")!;
  const { titleId } = c.req.valid("json");
  const updated = await backdateWatchedEpisodesToAirDate(user.id, titleId);
  return ok(c, { updated });
});

app.get("/history/:titleId", async (c) => {
  const user = c.get("user")!;
  const titleId = c.req.param("titleId");
  const [history, playCount] = await Promise.all([
    getTitleWatchHistory(user.id, titleId),
    getTitlePlayCount(user.id, titleId),
  ]);
  return ok(c, { history, playCount });
});

app.patch("/history/:id", zValidator("json", editHistorySchema), async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  const { watched_at } = c.req.valid("json");
  const timezone = c.req.header("X-Timezone") || "UTC";

  const { allowed, retryAfterMs } = await getWatchedEditStore().consume(
    `watched-edit:${user.id}`, 50, 60 * 60 * 1000, Date.now(),
  );
  if (!allowed) {
    c.header("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
    return c.json({ error: "Too many requests" }, 429);
  }

  const row = await getWatchHistoryById(id, user.id);
  if (!row) return c.json({ error: "Not found" }, 404);

  const todayLocal = localDateForTimezone(timezone);
  if (watched_at.slice(0, 10) > todayLocal) {
    return c.json({ error: "Validation failed", issues: [{ message: "Cannot set a future watched date" }] }, 400);
  }

  const normalised = watched_at.length === 10 ? `${watched_at} 00:00:00` : watched_at;

  await updateWatchHistoryWatchedAt(id, user.id, normalised);

  const latest = await getLatestWatchHistoryFor(user.id, row.titleId, row.episodeId);
  if (latest === normalised) {
    if (row.episodeId === null) {
      await setWatchedTitleWatchedAt(row.titleId, user.id, normalised);
    } else {
      await setWatchedEpisodeWatchedAt(row.episodeId, user.id, normalised);
    }
  }

  log.info("Watched timestamp edited", { historyId: id, userId: user.id });
  return ok(c, { id, watchedAt: normalised });
});

app.post("/:episodeId", async (c) => {
  const user = c.get("user")!;
  const timezone = c.req.header("X-Timezone") || "UTC";
  const episodeId = Number(c.req.param("episodeId"));
  if (isNaN(episodeId)) return c.json({ error: "Invalid episodeId" }, 400);
  const airDate = await getEpisodeAirDate(episodeId);
  if (!isReleased(airDate, timezone)) {
    return err(c, "Cannot mark an unreleased episode as watched");
  }
  await watchEpisode(episodeId, user.id);

  // Log to watch history
  const titleId = await getEpisodeTitleId(episodeId);
  if (titleId) {
    await logWatch(user.id, titleId, episodeId);
  }

  await onWatchedEpisode(user.id, String(episodeId));

  return ok(c, {});
});

app.delete("/:episodeId", async (c) => {
  // Achievements are sticky — deletes do not undo progress or earned badges.
  const user = c.get("user")!;
  const episodeId = Number(c.req.param("episodeId"));
  if (isNaN(episodeId)) return c.json({ error: "Invalid episodeId" }, 400);
  await unwatchEpisode(episodeId, user.id);
  return ok(c, {});
});

// ─── Movie Watched ───────────────────────────────────────────────────────────

app.post("/movies/:titleId", async (c) => {
  const user = c.get("user")!;
  const titleId = c.req.param("titleId");
  await watchTitle(titleId, user.id);
  await logWatch(user.id, titleId);
  await onWatchedTitle(user.id, titleId, true);
  return ok(c, {});
});

app.delete("/movies/:titleId", async (c) => {
  // Achievements are sticky — deletes do not undo progress or earned badges.
  const user = c.get("user")!;
  const titleId = c.req.param("titleId");
  await unwatchTitle(titleId, user.id);
  return ok(c, {});
});

export default app;
