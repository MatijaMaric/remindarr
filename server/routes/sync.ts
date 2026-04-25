import { Hono } from "hono";
import { z } from "zod";
import * as syncTitles from "../tmdb/sync-titles";
import { upsertTitles } from "../db/repository";
import { ok, err } from "./response";
import { zValidator } from "../lib/validator";

const app = new Hono();

const syncBodySchema = z.object({
  daysBack: z.number().int().positive().optional(),
  type: z.enum(["MOVIE", "SHOW"]).optional(),
  maxPages: z.number().int().positive().optional(),
});

app.post("/", zValidator("json", syncBodySchema), async (c) => {
  const body = c.req.valid("json");
  const daysBack = body.daysBack ?? 30;
  const objectType = body.type;
  const maxPages = body.maxPages ?? 10;

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
