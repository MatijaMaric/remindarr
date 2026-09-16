import { sql, type SQL } from "drizzle-orm";

/** Prefer measured episode minutes, then the show estimate; missing durations stay unknown. */
export function episodeRuntime(episode: SQL, show: SQL): SQL<number | null> {
  return sql`COALESCE(CASE WHEN ${episode} > 0 THEN ${episode} END, CASE WHEN ${show} > 0 THEN ${show} END)`;
}
