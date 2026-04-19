import { Hono } from "hono";
import { getRawDb } from "../db/bun-db";
import { activeSessionsGauge, renderMetrics } from "../metrics";
import { CONFIG } from "../config";

const app = new Hono();

// Cache the sessions count so Prometheus scrape traffic doesn't trigger a
// COUNT(*) on every poll. 10 seconds is shorter than typical scrape intervals
// so freshness stays useful, while still amortizing the query.
const SESSIONS_COUNT_CACHE_MS = 10_000;
let sessionsCountCache: { value: number; ts: number } | null = null;

function getSessionsCount(): number {
  const now = Date.now();
  if (sessionsCountCache && now - sessionsCountCache.ts < SESSIONS_COUNT_CACHE_MS) {
    return sessionsCountCache.value;
  }
  const db = getRawDb();
  const row = db
    .prepare("SELECT COUNT(*) as count FROM sessions WHERE expires_at > datetime('now')")
    .get() as { count: number } | null;
  const value = row?.count ?? 0;
  sessionsCountCache = { value, ts: now };
  return value;
}

// GET /metrics — Prometheus text format metrics
// Public unless METRICS_TOKEN is set, in which case a bearer token is required.
app.get("/", (c) => {
  if (CONFIG.METRICS_TOKEN) {
    const header = c.req.header("authorization") ?? "";
    const expected = `Bearer ${CONFIG.METRICS_TOKEN}`;
    if (header !== expected) {
      return c.json({ error: "Unauthorized" }, 401);
    }
  }

  activeSessionsGauge.set({}, getSessionsCount());

  return new Response(renderMetrics(), {
    headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
  });
});

/** @internal exposed for tests */
export function __resetSessionsCountCache() {
  sessionsCountCache = null;
}

export default app;
