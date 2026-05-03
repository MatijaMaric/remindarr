import { and, eq } from "drizzle-orm";
import { getDb, dismissedSuggestions } from "../schema";
import { traceDbQuery } from "../../tracing";

export async function dismissTitle(userId: string, titleId: string): Promise<void> {
  return traceDbQuery("dismissTitle", async () => {
    const db = getDb();
    await db
      .insert(dismissedSuggestions)
      .values({ userId, titleId })
      .onConflictDoNothing()
      .run();
  });
}

export async function undismissTitle(userId: string, titleId: string): Promise<void> {
  return traceDbQuery("undismissTitle", async () => {
    const db = getDb();
    await db
      .delete(dismissedSuggestions)
      .where(
        and(
          eq(dismissedSuggestions.userId, userId),
          eq(dismissedSuggestions.titleId, titleId),
        ),
      )
      .run();
  });
}

export async function getDismissedTitleIds(userId: string): Promise<Set<string>> {
  return traceDbQuery("getDismissedTitleIds", async () => {
    const db = getDb();
    const rows = await db
      .select({ titleId: dismissedSuggestions.titleId })
      .from(dismissedSuggestions)
      .where(eq(dismissedSuggestions.userId, userId))
      .all();
    return new Set(rows.map((r) => r.titleId));
  });
}

export async function getDismissedCount(userId: string): Promise<number> {
  return traceDbQuery("getDismissedCount", async () => {
    const db = getDb();
    const rows = await db
      .select({ titleId: dismissedSuggestions.titleId })
      .from(dismissedSuggestions)
      .where(eq(dismissedSuggestions.userId, userId))
      .all();
    return rows.length;
  });
}
