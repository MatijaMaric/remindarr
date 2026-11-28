import { sql } from "drizzle-orm";
import { getDb } from "../db/schema";
import { BACKFILL_DONE_KEY } from "../achievements/sync";
import { getSetting, setSetting } from "../db/repository/settings";
import { enqueueJob } from "./queue";
import { logger } from "../logger";
import { registerHandler } from "./worker";
import { backfillUserAchievements } from "./achievement-handlers";

export { backfillUserAchievements };

const log = logger.child({ module: "backfill-achievements" });
const PAGE_SIZE = 50;

export async function runBackfillAchievements(
  _data?: string | null,
): Promise<void> {
  const db = getDb();

  // 1. Read cursor
  const cursor = (await getSetting("achievements_backfill_cursor")) ?? "";

  // 2. Fetch next page of users
  const rows = await db.all<{ id: string }>(sql`
    SELECT id FROM users
    WHERE id > ${cursor}
    ORDER BY id ASC
    LIMIT ${PAGE_SIZE}
  `);

  if (rows.length === 0) {
    await setSetting(BACKFILL_DONE_KEY, "1");
    log.info("Backfill complete — no more users");
    return;
  }

  log.info("Backfill: processing page", { count: rows.length, cursor });

  for (const row of rows) {
    const userId = row.id;
    try {
      await backfillUserAchievements(userId);
    } catch (err) {
      log.warn("Backfill: error processing user", {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 4. Update cursor
  const lastUserId = rows[rows.length - 1].id;
  await setSetting("achievements_backfill_cursor", lastUserId);

  // 5. If full page returned, enqueue next batch
  if (rows.length === PAGE_SIZE) {
    enqueueJob(
      "backfill-achievements",
      {},
      { runAt: new Date(Date.now() + 5000) },
    );
    log.info("Backfill: enqueued next batch", { nextCursor: lastUserId });
  } else {
    // 6. Done
    await setSetting(BACKFILL_DONE_KEY, "1");
    log.info("Backfill: complete", { totalProcessed: rows.length });
  }
}

registerHandler("backfill-achievements", () => runBackfillAchievements());
