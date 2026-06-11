import { eq, and, asc, gt, notInArray, sql, max } from "drizzle-orm";
import { getDb, pinnedTitles, titles } from "../schema";
import { traceDbQuery } from "../../tracing";

const MAX_PINNED = 8;

export interface PinnedTitle {
  id: string;
  title: string;
  poster_url: string | null;
  object_type: string;
  position: number;
}

/**
 * Returns all pinned titles for a user, ordered by position ascending.
 * Joins with titles to get enough data for card rendering.
 */
export async function getPinnedTitles(userId: string): Promise<PinnedTitle[]> {
  return traceDbQuery("getPinnedTitles", async () => {
    const db = getDb();
    const rows = await db
      .select({
        id: titles.id,
        title: titles.title,
        poster_url: titles.posterUrl,
        object_type: titles.objectType,
        position: pinnedTitles.position,
      })
      .from(pinnedTitles)
      .innerJoin(titles, eq(titles.id, pinnedTitles.titleId))
      .where(eq(pinnedTitles.userId, userId))
      .orderBy(asc(pinnedTitles.position))
      .limit(MAX_PINNED)
      .all();

    return rows;
  });
}

/**
 * Pins a title for a user at the next available position.
 * Returns { ok: true } on success, or { ok: false, error: string } when the limit is reached
 * or the title is already pinned.
 */
export async function pinTitle(
  userId: string,
  titleId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return traceDbQuery("pinTitle", async () => {
    const db = getDb();

    // Check existing count
    const existing = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(pinnedTitles)
      .where(eq(pinnedTitles.userId, userId))
      .get();

    if ((existing?.count ?? 0) >= MAX_PINNED) {
      return {
        ok: false,
        error: `Maximum of ${MAX_PINNED} pinned titles reached`,
      };
    }

    // Get next position
    const maxRow = await db
      .select({ maxPos: max(pinnedTitles.position) })
      .from(pinnedTitles)
      .where(eq(pinnedTitles.userId, userId))
      .get();

    const nextPosition = (maxRow?.maxPos ?? -1) + 1;

    await db
      .insert(pinnedTitles)
      .values({ userId, titleId, position: nextPosition })
      .onConflictDoNothing()
      .run();

    return { ok: true };
  });
}

/**
 * Unpins a title for a user and renumbers remaining positions 0, 1, 2, …
 */
export async function unpinTitle(
  userId: string,
  titleId: string,
): Promise<void> {
  return traceDbQuery("unpinTitle", async () => {
    const db = getDb();

    const pinned = await db
      .select({ position: pinnedTitles.position })
      .from(pinnedTitles)
      .where(
        and(eq(pinnedTitles.userId, userId), eq(pinnedTitles.titleId, titleId)),
      )
      .get();

    if (!pinned) return;

    await db
      .delete(pinnedTitles)
      .where(
        and(eq(pinnedTitles.userId, userId), eq(pinnedTitles.titleId, titleId)),
      )
      .run();

    // Close the gap: shift everything after the removed position down by one
    await db
      .update(pinnedTitles)
      .set({ position: sql`${pinnedTitles.position} - 1` })
      .where(
        and(
          eq(pinnedTitles.userId, userId),
          gt(pinnedTitles.position, pinned.position),
        ),
      )
      .run();
  });
}

/**
 * Reorders pinned titles for a user.
 * Accepts an ordered array of titleIds; updates position for each.
 * Titles not present in the array are removed from pinned.
 */
export async function reorderPinnedTitles(
  userId: string,
  titleIds: string[],
): Promise<void> {
  return traceDbQuery("reorderPinnedTitles", async () => {
    const db = getDb();

    // Clamp to MAX_PINNED
    const ordered = titleIds.slice(0, MAX_PINNED);

    if (ordered.length === 0) {
      await db
        .delete(pinnedTitles)
        .where(eq(pinnedTitles.userId, userId))
        .run();
      return;
    }

    // Delete any existing pinned rows not in the new ordered list
    await db
      .delete(pinnedTitles)
      .where(
        and(
          eq(pinnedTitles.userId, userId),
          notInArray(pinnedTitles.titleId, ordered),
        ),
      )
      .run();

    // Upsert all titles with their new positions in one statement.
    // MAX_PINNED is 8, so this binds at most ~24 params — far below D1's 100 cap.
    await db
      .insert(pinnedTitles)
      .values(ordered.map((titleId, i) => ({ userId, titleId, position: i })))
      .onConflictDoUpdate({
        target: [pinnedTitles.userId, pinnedTitles.titleId],
        set: { position: sql`excluded.position` },
      })
      .run();
  });
}

/**
 * Returns whether a specific title is pinned by the user.
 */
export async function isPinnedTitle(
  userId: string,
  titleId: string,
): Promise<boolean> {
  return traceDbQuery("isPinnedTitle", async () => {
    const db = getDb();
    const row = await db
      .select({ titleId: pinnedTitles.titleId })
      .from(pinnedTitles)
      .where(
        and(eq(pinnedTitles.userId, userId), eq(pinnedTitles.titleId, titleId)),
      )
      .get();
    return row !== undefined;
  });
}
