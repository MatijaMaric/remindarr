import { Hono } from "hono";
import { getTitlesByMonth, getEpisodesByMonth } from "../db/repository";
import type { AppEnv } from "../types";

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  const user = c.get("user");
  const month = c.req.query("month"); // format: 2026-03
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "month parameter required (format: YYYY-MM)" }, 400);
  }

  const objectType = c.req.query("type");
  const provider = c.req.query("provider");

  if (objectType && !["MOVIE", "SHOW"].includes(objectType)) {
    return c.json({ error: "Invalid type. Must be one of: MOVIE, SHOW" }, 400);
  }

  const titles = await getTitlesByMonth({ month, objectType, provider }, user?.id);
  const episodes = await getEpisodesByMonth({ month, objectType, provider }, user?.id);
  return c.json({ titles, episodes, count: titles.length });
});

export default app;
