import { fetchNewReleases } from "../justwatch/client";
import { upsertTitles } from "../db/repository";
import { getDb } from "../db/schema";

const args = process.argv.slice(2);
const daysBack = Number(args[0]) || 30;
const type = args[1] as "MOVIE" | "SHOW" | undefined;

console.log(`Syncing titles from last ${daysBack} days...`);
if (type) console.log(`Filtering by type: ${type}`);

getDb();

try {
  const titles = await fetchNewReleases({ daysBack, objectType: type });
  const count = upsertTitles(titles);
  console.log(`Done! Synced ${count} titles.`);
} catch (err) {
  console.error("Sync failed:", err);
  process.exit(1);
}
