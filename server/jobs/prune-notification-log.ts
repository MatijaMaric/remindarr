import { logger } from "../logger";
import { registerHandler } from "./worker";
import { registerCron } from "./queue";
import { pruneOldRows } from "../db/repository";

const log = logger.child({ module: "prune-notification-log" });

export function registerPruneNotificationLogJob() {
  registerHandler("prune-notification-log", async () => {
    await pruneOldRows();
    log.info("Pruned old notification log rows");
  });

  // Run daily at 03:00 UTC (low-traffic time)
  registerCron("prune-notification-log", "0 3 * * *");
}
