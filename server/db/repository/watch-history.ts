import { eq, and, count, desc, isNull, or, lt, type SQL } from "drizzle-orm";
import { getDb } from "../schema";
import { watchHistory } from "../schema";
import { traceDbQuery } from "../../tracing";
import { randomUUID } from "node:crypto";

export async function logWatch(
  userId: string,
  titleId: string,
  episodeId?: number,
  watchedAt?: string,
): Promise<void> {
  return traceDbQuery("logWatch", async () => {
    const db = getDb();
    await db.insert(watchHistory)
      .values({
        id: randomUUID(),
        userId,
        titleId,
        episodeId: episodeId ?? null,
        ...(watchedAt ? { watchedAt } : {}),
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

export async function getWatchHistoryById(
  id: string,
  userId: string,
): Promise<{ id: string; userId: string; titleId: string; episodeId: number | null; watchedAt: string } | null> {
  return traceDbQuery("getWatchHistoryById", async () => {
    const db = getDb();
    const row = await db
      .select({
        id: watchHistory.id,
        userId: watchHistory.userId,
        titleId: watchHistory.titleId,
        episodeId: watchHistory.episodeId,
        watchedAt: watchHistory.watchedAt,
      })
      .from(watchHistory)
      .where(and(eq(watchHistory.id, id), eq(watchHistory.userId, userId)))
      .get();
    return row ?? null;
  });
}

export async function updateWatchHistoryWatchedAt(
  id: string,
  userId: string,
  watchedAt: string,
): Promise<void> {
  return traceDbQuery("updateWatchHistoryWatchedAt", async () => {
    const db = getDb();
    await db
      .update(watchHistory)
      .set({ watchedAt })
      .where(and(eq(watchHistory.id, id), eq(watchHistory.userId, userId)))
      .run();
  });
}

export async function getLatestWatchHistoryFor(
  userId: string,
  titleId: string,
  episodeId: number | null,
): Promise<string | null> {
  return traceDbQuery("getLatestWatchHistoryFor", async () => {
    const db = getDb();
    const conditions = [
      eq(watchHistory.userId, userId),
      eq(watchHistory.titleId, titleId),
      episodeId === null ? isNull(watchHistory.episodeId) : eq(watchHistory.episodeId, episodeId),
    ];
    const row = await db
      .select({ watchedAt: watchHistory.watchedAt })
      .from(watchHistory)
      .where(and(...conditions))
      .orderBy(desc(watchHistory.watchedAt))
      .limit(1)
      .get();
    return row?.watchedAt ?? null;
  });
}

export async function getTitleWatchHistory(
  userId: string,
  titleId: string,
  options: { limit?: number; before?: string | null; episodeId?: number | null } = {},
): Promise<{
  history: { id: string; watchedAt: string; episodeId: number | null; note: string | null }[];
  has_more: boolean;
  next_cursor: string | null;
}> {
  return traceDbQuery("getTitleWatchHistory", async () => {
    const limit = Math.max(1, Math.min(options.limit ?? 50, 100));
    const fetchN = limit + 1;

    const conditions: SQL[] = [
      eq(watchHistory.userId, userId),
      eq(watchHistory.titleId, titleId),
    ];

    if (options.episodeId != null) {
      conditions.push(eq(watchHistory.episodeId, options.episodeId));
    }

    if (options.before) {
      const pipeIdx = options.before.indexOf("|");
      // Malformed cursor (no pipe separator) — treat as first page rather than erroring.
      // Cursors are opaque tokens sourced from next_cursor responses, not user-constructed.
      if (pipeIdx !== -1) {
        const ts = options.before.slice(0, pipeIdx);
        const cid = options.before.slice(pipeIdx + 1);
        const cursorCondition = or(
          lt(watchHistory.watchedAt, ts),
          and(eq(watchHistory.watchedAt, ts), lt(watchHistory.id, cid)),
        );
        if (cursorCondition) conditions.push(cursorCondition);
      }
    }

    const db = getDb();
    const rows = await db
      .select({
        id: watchHistory.id,
        watchedAt: watchHistory.watchedAt,
        episodeId: watchHistory.episodeId,
        note: watchHistory.note,
      })
      .from(watchHistory)
      .where(and(...conditions))
      .orderBy(desc(watchHistory.watchedAt), desc(watchHistory.id))
      .limit(fetchN)
      .all();

    const has_more = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const next_cursor = has_more && last ? `${last.watchedAt}|${last.id}` : null;
    return { history: page, has_more, next_cursor };
  });
}
