import { Hono } from "hono";
import * as syncTitles from "../tmdb/sync-titles";
import { upsertTitles } from "../db/repository";
import { ok, err } from "./response";

const app = new Hono();

app.post("/", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return err(c, "Invalid JSON in request body");
  }
  const daysBack = (body.daysBack as number) || 30;
  const objectType = body.type as "MOVIE" | "SHOW" | undefined;
  const maxPages = (body.maxPages as number) || 10;

  try {
    const titles = await syncTitles.fetchNewReleases({ daysBack, objectType, maxPages });
    const count = await upsertTitles(titles);
    return ok(c, { count, message: `Synced ${count} titles` });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return err(c, message, 500);
  }
});

export default app;
