import { Hono } from "hono";
import { getTitlesByMonth, getEpisodesByMonth } from "../db/repository";
import type { AppEnv } from "../types";

const app = new Hono<AppEnv>();

app.get("/", (c) => {
  const user = c.get("user");
  const month = c.req.query("month"); // format: 2026-03
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "month parameter required (format: YYYY-MM)" }, 400);
  }

  const objectType = c.req.query("type");
  const provider = c.req.query("provider");

  const titles = getTitlesByMonth({ month, objectType, provider }, user?.id);
  const episodes = getEpisodesByMonth({ month, objectType, provider }, user?.id);
  return c.json({ titles, episodes, count: titles.length });
});

export default app;
