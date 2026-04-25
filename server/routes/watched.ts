import { Hono } from "hono";
import { z } from "zod";
import {
  watchEpisode, unwatchEpisode, watchEpisodesBulk, unwatchEpisodesBulk,
  getEpisodeAirDate, getReleasedEpisodeIds, getReleasedEpisodesWithAirDate,
  watchTitle, unwatchTitle, getEpisodeTitleId, getEpisodeTitleIds,
} from "../db/repository";
import { logWatch, getTitlePlayCount, getTitleWatchHistory } from "../db/repository/watch-history";
import { localDateForTimezone } from "../utils/timezone";
import type { AppEnv } from "../types";
import { ok, err } from "./response";
import { zValidator } from "../lib/validator";

const app = new Hono<AppEnv>();

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
  } else {
    await unwatchEpisodesBulk(episodeIds, user.id);
  }

  return ok(c, {});
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

  return ok(c, {});
});

app.delete("/:episodeId", async (c) => {
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
  return ok(c, {});
});

app.delete("/movies/:titleId", async (c) => {
  const user = c.get("user")!;
  const titleId = c.req.param("titleId");
  await unwatchTitle(titleId, user.id);
  return ok(c, {});
});

export default app;
