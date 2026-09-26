import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../schema";
import { watchedTitles, tracked, titles } from "../schema";
import { traceDbQuery } from "../../tracing";

async function isMovie(titleId: string): Promise<boolean> {
  const db = getDb();
  const row = await db
    .select({ objectType: titles.objectType })
    .from(titles)
    .where(eq(titles.id, titleId))
    .get();
  return row?.objectType === "MOVIE";
}

export async function watchTitle(titleId: string, userId: string) {
  return traceDbQuery("watchTitle", async () => {
    const db = getDb();
    await db
      .insert(watchedTitles)
      .values({ titleId, userId })
      .onConflictDoNothing()
      .run();
    if (await isMovie(titleId)) {
      await db
        .update(tracked)
        .set({ userStatus: "completed" })
        .where(and(eq(tracked.titleId, titleId), eq(tracked.userId, userId)))
        .run();
    }
  });
}

// watched_titles binds title_id and user_id (2 params). D1 caps at 100.
const BULK_WATCH_TITLE_CHUNK = 45;
const BULK_MOVIE_STATUS_CHUNK = 90;

export async function watchTitlesBulk(userId: string, titleIds: string[]) {
  return traceDbQuery("watchTitlesBulk", async () => {
    if (titleIds.length === 0) return;
    const unique = [...new Set(titleIds)];
    const db = getDb();
    for (let i = 0; i < unique.length; i += BULK_WATCH_TITLE_CHUNK) {
      const chunk = unique.slice(i, i + BULK_WATCH_TITLE_CHUNK);
      await db
        .insert(watchedTitles)
        .values(chunk.map((titleId) => ({ titleId, userId })))
        .onConflictDoNothing()
        .run();
    }

    const movieIds: string[] = [];
    for (let i = 0; i < unique.length; i += BULK_MOVIE_STATUS_CHUNK) {
      const chunk = unique.slice(i, i + BULK_MOVIE_STATUS_CHUNK);
      const rows = await db
        .select({ id: titles.id })
        .from(titles)
        .where(and(inArray(titles.id, chunk), eq(titles.objectType, "MOVIE")))
        .all();
      for (const row of rows) movieIds.push(row.id);
    }
    for (let i = 0; i < movieIds.length; i += BULK_MOVIE_STATUS_CHUNK) {
      const chunk = movieIds.slice(i, i + BULK_MOVIE_STATUS_CHUNK);
      await db
        .update(tracked)
        .set({ userStatus: "completed" })
        .where(and(eq(tracked.userId, userId), inArray(tracked.titleId, chunk)))
        .run();
    }
  });
}

export async function unwatchTitle(titleId: string, userId: string) {
  return traceDbQuery("unwatchTitle", async () => {
    const db = getDb();
    await db
      .delete(watchedTitles)
      .where(
        and(
          eq(watchedTitles.titleId, titleId),
          eq(watchedTitles.userId, userId),
        ),
      )
      .run();
    if (await isMovie(titleId)) {
      await db
        .update(tracked)
        .set({ userStatus: null })
        .where(
          and(
            eq(tracked.titleId, titleId),
            eq(tracked.userId, userId),
            eq(tracked.userStatus, "completed"),
          ),
        )
        .run();
    }
  });
}

export async function setWatchedTitleWatchedAt(
  titleId: string,
  userId: string,
  watchedAt: string,
): Promise<void> {
  return traceDbQuery("setWatchedTitleWatchedAt", async () => {
    const db = getDb();
    await db
      .update(watchedTitles)
      .set({ watchedAt })
      .where(
        and(
          eq(watchedTitles.titleId, titleId),
          eq(watchedTitles.userId, userId),
        ),
      )
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
