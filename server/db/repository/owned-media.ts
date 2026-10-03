import { and, asc, eq, notInArray } from "drizzle-orm";
import { getDb, ownedMedia, type OwnedFormat } from "../schema";
import { traceDbQuery } from "../../tracing";

export async function getOwnedFormats(
  userId: string,
  titleId: string,
): Promise<OwnedFormat[]> {
  return traceDbQuery("getOwnedFormats", async () => {
    const rows = await getDb()
      .select({ format: ownedMedia.format })
      .from(ownedMedia)
      .where(
        and(eq(ownedMedia.userId, userId), eq(ownedMedia.titleId, titleId)),
      )
      .orderBy(asc(ownedMedia.format))
      .all();
    return rows.map((r) => r.format);
  });
}

/** Replaces the user's owned formats for a title. An empty list removes them all. */
export async function setOwnedFormats(
  userId: string,
  titleId: string,
  formats: OwnedFormat[],
): Promise<void> {
  return traceDbQuery("setOwnedFormats", async () => {
    const db = getDb();
    const scope = and(
      eq(ownedMedia.userId, userId),
      eq(ownedMedia.titleId, titleId),
    );
    // Delete-then-insert without a transaction (D1); a failure in between
    // only leaves formats missing that the next save re-adds.
    await db
      .delete(ownedMedia)
      .where(
        formats.length > 0
          ? and(scope, notInArray(ownedMedia.format, formats))
          : scope,
      )
      .run();
    if (formats.length > 0) {
      await db
        .insert(ownedMedia)
        .values(formats.map((format) => ({ userId, titleId, format })))
        .onConflictDoNothing()
        .run();
    }
  });
}
