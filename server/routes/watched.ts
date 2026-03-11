import { Hono } from "hono";
import { watchEpisode, unwatchEpisode, watchEpisodesBulk, unwatchEpisodesBulk } from "../db/repository";
import type { AppEnv } from "../types";

const app = new Hono<AppEnv>();

app.post("/bulk", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const { episodeIds, watched } = body as { episodeIds: number[]; watched: boolean };

  if (!Array.isArray(episodeIds) || episodeIds.length === 0) {
    return c.json({ error: "episodeIds must be a non-empty array" }, 400);
  }

  if (watched) {
    watchEpisodesBulk(episodeIds, user.id);
  } else {
    unwatchEpisodesBulk(episodeIds, user.id);
  }

  return c.json({ success: true });
});

app.post("/:episodeId", (c) => {
  const user = c.get("user")!;
  const episodeId = Number(c.req.param("episodeId"));
  watchEpisode(episodeId, user.id);
  return c.json({ success: true });
});

app.delete("/:episodeId", (c) => {
  const user = c.get("user")!;
  const episodeId = Number(c.req.param("episodeId"));
  unwatchEpisode(episodeId, user.id);
  return c.json({ success: true });
});

export default app;
