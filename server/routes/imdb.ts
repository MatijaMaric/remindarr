import { Hono } from "hono";
import * as resolver from "../imdb/resolver";
import { upsertTitles, trackTitle } from "../db/repository";
import type { AppEnv } from "../types";
import { ok, err } from "./response";

const app = new Hono<AppEnv>();

app.post("/", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const url = body.url;
  if (!url) {
    return err(c, "url is required");
  }

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
  } catch (e: any) {
    return err(c, e.message, 500);
  }
});

export default app;
