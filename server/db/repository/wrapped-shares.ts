import { and, eq } from "drizzle-orm";
import { getDb, users, wrappedShareTokens } from "../schema";

export async function getWrappedShareToken(userId: string, year: number) {
  const row = await getDb()
    .select({ token: wrappedShareTokens.token })
    .from(wrappedShareTokens)
    .where(
      and(
        eq(wrappedShareTokens.userId, userId),
        eq(wrappedShareTokens.year, year),
      ),
    )
    .get();
  return row?.token ?? null;
}

export async function setWrappedShareToken(
  userId: string,
  year: number,
  token: string | null,
) {
  const db = getDb();
  if (token === null) {
    await db
      .delete(wrappedShareTokens)
      .where(
        and(
          eq(wrappedShareTokens.userId, userId),
          eq(wrappedShareTokens.year, year),
        ),
      )
      .run();
  } else {
    await db
      .insert(wrappedShareTokens)
      .values({ userId, year, token })
      .onConflictDoUpdate({
        target: [wrappedShareTokens.userId, wrappedShareTokens.year],
        set: { token },
      })
      .run();
  }
}

export async function getUserByWrappedShareToken(token: string, year: number) {
  return getDb()
    .select({
      id: users.id,
      username: users.username,
      displayUsername: users.displayUsername,
    })
    .from(wrappedShareTokens)
    .innerJoin(users, eq(users.id, wrappedShareTokens.userId))
    .where(
      and(
        eq(wrappedShareTokens.token, token),
        eq(wrappedShareTokens.year, year),
      ),
    )
    .get();
}
