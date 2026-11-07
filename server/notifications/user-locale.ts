import { eq, inArray } from "drizzle-orm";
import { getDb, users } from "../db/schema";
import { traceDbQuery } from "../tracing";

// Stay well under D1's bound-parameter limit.
const LOCALES_CHUNK_SIZE = 50;

/** The user's saved UI language (`users.locale`), or null when unset/unknown. */
export async function getUserLocale(userId: string): Promise<string | null> {
  return traceDbQuery("getUserLocale", async () => {
    const row = await getDb()
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    return row?.locale ?? null;
  });
}

/** Saved UI languages for many users; users without one are omitted. */
export async function getUserLocales(
  userIds: string[],
): Promise<Map<string, string>> {
  return traceDbQuery("getUserLocales", async () => {
    const result = new Map<string, string>();
    for (let i = 0; i < userIds.length; i += LOCALES_CHUNK_SIZE) {
      const rows = await getDb()
        .select({ id: users.id, locale: users.locale })
        .from(users)
        .where(inArray(users.id, userIds.slice(i, i + LOCALES_CHUNK_SIZE)))
        .all();
      for (const row of rows) if (row.locale) result.set(row.id, row.locale);
    }
    return result;
  });
}
