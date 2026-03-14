import { logger } from "../logger";
import { fetchNewReleases } from "../tmdb/sync-titles";

const log = logger.child({ module: "cli" });
import { upsertTitles } from "../db/repository";
import { getDb } from "../db/schema";

const args = process.argv.slice(2);
const daysBack = Number(args[0]) || 30;
const type = args[1] as "MOVIE" | "SHOW" | undefined;

log.info("Syncing titles", { daysBack });
if (type) log.info("Filtering by type", { type });

getDb();

try {
  const titles = await fetchNewReleases({ daysBack, objectType: type });
  const count = upsertTitles(titles);
  log.info("Sync complete", { count });
} catch (err) {
  log.error("Sync failed", { err });
  process.exit(1);
}
