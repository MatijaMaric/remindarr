import { Hono } from "hono";
import { watchEpisode, unwatchEpisode, watchEpisodesBulk, unwatchEpisodesBulk, getEpisodeAirDate, getReleasedEpisodeIds } from "../db/repository";
import type { AppEnv } from "../types";
import { ok, err } from "./response";

const app = new Hono<AppEnv>();

function isReleased(airDate: string | null): boolean {
  if (!airDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return airDate <= today;
}

app.post("/bulk", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const { episodeIds, watched } = body as { episodeIds: number[]; watched: boolean };

  if (!Array.isArray(episodeIds) || episodeIds.length === 0) {
    return err(c, "episodeIds must be a non-empty array");
  }

  if (watched) {
    const releasedIds = await getReleasedEpisodeIds(episodeIds);
    if (releasedIds.length === 0) {
      return err(c, "Cannot mark unreleased episodes as watched");
    }
    await watchEpisodesBulk(releasedIds, user.id);
  } else {
    await unwatchEpisodesBulk(episodeIds, user.id);
  }

  return ok(c, {});
});

app.post("/:episodeId", async (c) => {
  const user = c.get("user")!;
  const episodeId = Number(c.req.param("episodeId"));
  if (isNaN(episodeId)) return c.json({ error: "Invalid episodeId" }, 400);
  const airDate = await getEpisodeAirDate(episodeId);
  if (!isReleased(airDate)) {
    return err(c, "Cannot mark an unreleased episode as watched");
  }
  await watchEpisode(episodeId, user.id);
  return ok(c, {});
});

app.delete("/:episodeId", async (c) => {
  const user = c.get("user")!;
  const episodeId = Number(c.req.param("episodeId"));
  if (isNaN(episodeId)) return c.json({ error: "Invalid episodeId" }, 400);
  await unwatchEpisode(episodeId, user.id);
  return ok(c, {});
});

export default app;
