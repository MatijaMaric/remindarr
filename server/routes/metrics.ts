import { Hono } from "hono";
import { getRawDb } from "../db/bun-db";
import { activeSessionsGauge, renderMetrics } from "../metrics";

const app = new Hono();

// GET /metrics — Prometheus text format metrics
// Public endpoint (protect via reverse proxy or METRICS_TOKEN env var if needed)
app.get("/", (c) => {
  // Query active (non-expired) session count on-demand
  const db = getRawDb();
  const row = db
    .prepare("SELECT COUNT(*) as count FROM sessions WHERE expires_at > datetime('now')")
    .get() as { count: number } | null;
  activeSessionsGauge.set({}, row?.count ?? 0);

  return new Response(renderMetrics(), {
    headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
  });
});

export default app;
