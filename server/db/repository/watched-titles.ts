import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../schema";
import { watchedTitles } from "../schema";
import { traceDbQuery } from "../../tracing";

export async function watchTitle(titleId: string, userId: string) {
  return traceDbQuery("watchTitle", async () => {
    const db = getDb();
    await db.insert(watchedTitles)
      .values({ titleId, userId })
      .onConflictDoNothing()
      .run();
  });
}

export async function unwatchTitle(titleId: string, userId: string) {
  return traceDbQuery("unwatchTitle", async () => {
    const db = getDb();
    await db.delete(watchedTitles)
      .where(and(eq(watchedTitles.titleId, titleId), eq(watchedTitles.userId, userId)))
      .run();
  });
}

export async function getWatchedTitleIds(userId: string): Promise<Set<string>> {
  return traceDbQuery("getWatchedTitleIds", async () => {
    const db = getDb();
    const rows = await db
      .select({ titleId: watchedTitles.titleId })
      .from(watchedTitles)
      .where(eq(watchedTitles.userId, userId))
      .all();
    return new Set(rows.map((r) => r.titleId));
  });
}
