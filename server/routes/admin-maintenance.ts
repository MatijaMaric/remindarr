import { Hono } from "hono";
import type { AppEnv } from "../types";
import { ok } from "./response";
import { logger } from "../logger";
import { getCache } from "../cache";
import { getCronJobs, enqueueJob } from "../jobs/queue";

const log = logger.child({ module: "admin-maintenance" });

const app = new Hono<AppEnv>();

// POST /api/admin/maintenance/flush-cache — evict all cache entries
app.post("/flush-cache", async (c) => {
  const user = c.get("user")!;
  const cache = getCache();
  if (cache.flush) {
    await cache.flush();
    log.info("admin maintenance", { action: "flush-cache", by: user.id });
    return ok(c, { flushed: true });
  }
  return c.json({ error: "Cache backend does not support flush" }, 501);
});

// POST /api/admin/maintenance/run-jobs — enqueue all registered cron jobs immediately
app.post("/run-jobs", (c) => {
  const user = c.get("user")!;
  const crons = getCronJobs();
  const queued: string[] = [];
  for (const cron of crons) {
    if (cron.enabled) {
      enqueueJob(cron.name);
      queued.push(cron.name);
    }
  }
  log.info("admin maintenance", { action: "run-jobs", queued, by: user.id });
  return ok(c, { queued });
});

// POST /api/admin/maintenance/backup — enqueue an immediate DB backup
app.post("/backup", (c) => {
  const user = c.get("user")!;
  enqueueJob("backup");
  log.info("admin maintenance", { action: "backup", by: user.id });
  return ok(c, { queued: true });
});

export default app;
