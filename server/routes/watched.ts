import { Hono } from "hono";
import { watchEpisode, unwatchEpisode, watchEpisodesBulk, unwatchEpisodesBulk, getEpisodeAirDate, getReleasedEpisodeIds } from "../db/repository";
import { localDateForTimezone } from "../utils/timezone";
import type { AppEnv } from "../types";

const app = new Hono<AppEnv>();

function isReleased(airDate: string | null, timezone: string): boolean {
  if (!airDate) return false;
  const today = localDateForTimezone(timezone);
  return airDate <= today;
}

app.post("/bulk", async (c) => {
  const user = c.get("user")!;
  const timezone = c.req.header("X-Timezone") || "UTC";
  const body = await c.req.json();
  const { episodeIds, watched } = body as { episodeIds: number[]; watched: boolean };

  if (!Array.isArray(episodeIds) || episodeIds.length === 0) {
    return c.json({ error: "episodeIds must be a non-empty array" }, 400);
  }

  if (watched) {
    const releasedIds = await getReleasedEpisodeIds(episodeIds, timezone);
    if (releasedIds.length === 0) {
      return c.json({ error: "Cannot mark unreleased episodes as watched" }, 400);
    }
    await watchEpisodesBulk(releasedIds, user.id);
  } else {
    await unwatchEpisodesBulk(episodeIds, user.id);
  }

  return c.json({ success: true });
});

app.post("/:episodeId", async (c) => {
  const user = c.get("user")!;
  const timezone = c.req.header("X-Timezone") || "UTC";
  const episodeId = Number(c.req.param("episodeId"));
  const airDate = await getEpisodeAirDate(episodeId);
  if (!isReleased(airDate, timezone)) {
    return c.json({ error: "Cannot mark an unreleased episode as watched" }, 400);
  }
  await watchEpisode(episodeId, user.id);
  return c.json({ success: true });
});

app.delete("/:episodeId", async (c) => {
  const user = c.get("user")!;
  const episodeId = Number(c.req.param("episodeId"));
  await unwatchEpisode(episodeId, user.id);
  return c.json({ success: true });
});

export default app;
