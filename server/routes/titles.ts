import { Hono } from "hono";
import { getRecentTitles, getProviders } from "../db/repository";
import type { AppEnv } from "../types";

const app = new Hono<AppEnv>();

app.get("/", (c) => {
  const user = c.get("user");
  const daysBack = Number(c.req.query("daysBack")) || 30;
  const objectType = c.req.query("type");
  const provider = c.req.query("provider");
  const limit = Number(c.req.query("limit")) || 100;
  const offset = Number(c.req.query("offset")) || 0;

  const titles = getRecentTitles({ daysBack, objectType, provider, limit, offset }, user?.id);
  return c.json({ titles, count: titles.length });
});

app.get("/providers", (c) => {
  const providers = getProviders();
  return c.json({ providers });
});

export default app;
