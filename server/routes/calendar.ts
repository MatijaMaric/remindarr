import { Hono } from "hono";
import { z } from "zod";
import { getTitlesByMonth, getEpisodesByMonth } from "../db/repository";
import type { AppEnv } from "../types";
import { ok } from "./response";
import { setPublicCacheIfAnon } from "./cache-headers";
import { zValidator } from "../lib/validator";

const calendarQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM"),
  type: z.enum(["MOVIE", "SHOW"]).optional(),
  provider: z.string().optional(),
});

const app = new Hono<AppEnv>();

app.get("/", zValidator("query", calendarQuerySchema), async (c) => {
  const user = c.get("user");
  const { month, type: objectType, provider } = c.req.valid("query");

  const titles = await getTitlesByMonth(
    { month, objectType, provider },
    user?.id,
  );
  const episodes = await getEpisodesByMonth(
    { month, objectType, provider },
    user?.id,
  );
  setPublicCacheIfAnon(c, 1800);
  return ok(c, { titles, episodes, count: titles.length });
});

export default app;
