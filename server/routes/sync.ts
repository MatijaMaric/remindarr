import { Hono } from "hono";
import { fetchNewReleases } from "../tmdb/sync-titles";
import { upsertTitles } from "../db/repository";

const app = new Hono();

app.post("/", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON in request body" }, 400);
  }
  const daysBack = (body.daysBack as number) || 30;
  const objectType = body.type as "MOVIE" | "SHOW" | undefined;
  const maxPages = (body.maxPages as number) || 10;

  try {
    const titles = await fetchNewReleases({ daysBack, objectType, maxPages });
    const count = upsertTitles(titles);
    return c.json({ success: true, count, message: `Synced ${count} titles` });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

export default app;
