import { Hono } from "hono";
import * as resolver from "../imdb/resolver";
import { upsertTitles, trackTitle } from "../db/repository";
import type { AppEnv } from "../types";

const app = new Hono<AppEnv>();

app.post("/", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const url = body.url;
  if (!url) {
    return c.json({ error: "url is required" }, 400);
  }

  const imdbId = resolver.extractImdbId(url);
  if (!imdbId) {
    return c.json({ error: "Invalid IMDB URL or ID" }, 400);
  }

  try {
    const title = await resolver.resolveImdbUrl(url);
    if (!title) {
      return c.json({ error: "Title not found" }, 404);
    }

    upsertTitles([title]);
    trackTitle(title.id, user.id);

    return c.json({ success: true, title });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;
