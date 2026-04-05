import { eq, and, count, desc } from "drizzle-orm";
import { getDb } from "../schema";
import { watchHistory } from "../schema";
import { traceDbQuery } from "../../tracing";
import { randomUUID } from "node:crypto";

export async function logWatch(userId: string, titleId: string, episodeId?: number): Promise<void> {
  return traceDbQuery("logWatch", async () => {
    const db = getDb();
    await db.insert(watchHistory)
      .values({
        id: randomUUID(),
        userId,
        titleId,
        episodeId: episodeId ?? null,
      })
      .run();
  });
}

export async function getTitlePlayCount(userId: string, titleId: string): Promise<number> {
  return traceDbQuery("getTitlePlayCount", async () => {
    const db = getDb();
    const row = await db
      .select({ cnt: count() })
      .from(watchHistory)
      .where(and(eq(watchHistory.userId, userId), eq(watchHistory.titleId, titleId)))
      .get();
    return row?.cnt ?? 0;
  });
}

export async function getTitleWatchHistory(
  userId: string,
  titleId: string
): Promise<{ id: string; watchedAt: string; episodeId: number | null; note: string | null }[]> {
  return traceDbQuery("getTitleWatchHistory", async () => {
    const db = getDb();
    const rows = await db
      .select({
        id: watchHistory.id,
        watchedAt: watchHistory.watchedAt,
        episodeId: watchHistory.episodeId,
        note: watchHistory.note,
      })
      .from(watchHistory)
      .where(and(eq(watchHistory.userId, userId), eq(watchHistory.titleId, titleId)))
      .orderBy(desc(watchHistory.watchedAt))
      .all();
    return rows;
  });
}
