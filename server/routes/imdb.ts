import { Hono } from "hono";
import { z } from "zod";
import * as resolver from "../imdb/resolver";
import { upsertTitles, trackTitle } from "../db/repository";
import type { AppEnv } from "../types";
import { ok, err } from "./response";
import { zValidator } from "../lib/validator";

const app = new Hono<AppEnv>();

const imdbBodySchema = z.object({
  url: z.string().min(1),
});

app.post("/", zValidator("json", imdbBodySchema), async (c) => {
  const user = c.get("user")!;
  const { url } = c.req.valid("json");

  const imdbId = resolver.extractImdbId(url);
  if (!imdbId) {
    return err(c, "Invalid IMDB URL or ID");
  }

  try {
    const title = await resolver.resolveImdbUrl(url);
    if (!title) {
      return err(c, "Title not found", 404);
    }

    await upsertTitles([title]);
    await trackTitle(title.id, user.id);

    return ok(c, { title });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "An unexpected error occurred";
    return err(c, message, 500);
  }
});

export default app;
