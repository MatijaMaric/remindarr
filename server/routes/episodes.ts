import { Hono } from "hono";
import { syncEpisodes } from "../tmdb/sync";
import { CONFIG } from "../config";

const app = new Hono();

app.post("/sync", async (c) => {
  if (!CONFIG.TMDB_API_KEY) {
    return c.json({ error: "TMDB_API_KEY not configured" }, 500);
  }

  const result = await syncEpisodes();
  return c.json({
    success: true,
    ...result,
    message: `Synced ${result.synced} episodes from ${result.shows} shows`,
  });
});

export default app;
