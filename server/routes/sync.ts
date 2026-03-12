import { Hono } from "hono";
import { fetchNewReleases } from "../tmdb/sync-titles";
import { upsertTitles } from "../db/repository";

const app = new Hono();

app.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const daysBack = body.daysBack || 30;
  const objectType = body.type;
  const maxPages = body.maxPages || 10;

  try {
    const titles = await fetchNewReleases({ daysBack, objectType, maxPages });
    const count = upsertTitles(titles);
    return c.json({ success: true, count, message: `Synced ${count} titles` });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

export default app;
