import { eq, and } from "drizzle-orm";
import { getDb, titleTags } from "../schema";
import { traceDbQuery } from "../../tracing";

/**
 * Returns all tags for a given user, keyed by title ID.
 */
export async function getTagsForUser(userId: string): Promise<Record<string, string[]>> {
  return traceDbQuery("getTagsForUser", async () => {
    const db = getDb();
    const rows = await db
      .select({ titleId: titleTags.titleId, tag: titleTags.tag })
      .from(titleTags)
      .where(eq(titleTags.userId, userId))
      .all();

    const result: Record<string, string[]> = {};
    for (const row of rows) {
      if (!result[row.titleId]) result[row.titleId] = [];
      result[row.titleId].push(row.tag);
    }
    return result;
  });
}

/**
 * Returns the tags for a specific (user, title) pair.
 */
export async function getTagsForTitle(userId: string, titleId: string): Promise<string[]> {
  return traceDbQuery("getTagsForTitle", async () => {
    const db = getDb();
    const rows = await db
      .select({ tag: titleTags.tag })
      .from(titleTags)
      .where(and(eq(titleTags.userId, userId), eq(titleTags.titleId, titleId)))
      .all();
    return rows.map((r) => r.tag);
  });
}

/**
 * Replaces all tags for a (user, title) pair with the provided list.
 * An empty array clears all tags.
 */
export async function setTags(userId: string, titleId: string, tags: string[]): Promise<void> {
  return traceDbQuery("setTags", async () => {
    const db = getDb();
    // Delete all existing tags for this (user, title)
    await db
      .delete(titleTags)
      .where(and(eq(titleTags.userId, userId), eq(titleTags.titleId, titleId)))
      .run();

    if (tags.length > 0) {
      await db
        .insert(titleTags)
        .values(tags.map((tag) => ({ userId, titleId, tag })))
        .run();
    }
  });
}
