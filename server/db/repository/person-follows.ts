import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, notifiers, personCreditAlerts, personFollows } from "../schema";
import { traceDbQuery } from "../../tracing";

export interface FollowedPerson {
  id: number;
  name: string;
  profile_path: string | null;
}

export interface PersonCreditAlert {
  personId: number;
  creditKey: string;
  personName: string;
  title: string;
  role: string | null;
  releaseDate: string | null;
  posterPath: string | null;
}

// Same defensive cap as user follow lists (public profile read).
const MAX_FOLLOWED_PEOPLE = 500;

export async function followPerson(
  userId: string,
  person: { id: number; name: string; profilePath: string | null },
  seenCredits: string[],
) {
  return traceDbQuery("followPerson", async () => {
    await getDb()
      .insert(personFollows)
      .values({
        userId,
        personId: person.id,
        name: person.name,
        profilePath: person.profilePath,
        seenCredits: JSON.stringify(seenCredits),
      })
      .onConflictDoNothing()
      .run();
  });
}

export async function unfollowPerson(userId: string, personId: number) {
  return traceDbQuery("unfollowPerson", async () => {
    await getDb()
      .delete(personFollows)
      .where(
        and(
          eq(personFollows.userId, userId),
          eq(personFollows.personId, personId),
        ),
      )
      .run();
  });
}

export async function isFollowingPerson(
  userId: string,
  personId: number,
): Promise<boolean> {
  return traceDbQuery("isFollowingPerson", async () => {
    const row = await getDb()
      .select({ personId: personFollows.personId })
      .from(personFollows)
      .where(
        and(
          eq(personFollows.userId, userId),
          eq(personFollows.personId, personId),
        ),
      )
      .get();
    return row != null;
  });
}

/** Which of `personIds` the user follows (for marking search results). */
export async function getFollowedPersonIdsAmong(
  userId: string,
  personIds: number[],
): Promise<Set<number>> {
  if (personIds.length === 0) return new Set();
  return traceDbQuery("getFollowedPersonIdsAmong", async () => {
    const rows = await getDb()
      .select({ personId: personFollows.personId })
      .from(personFollows)
      .where(
        and(
          eq(personFollows.userId, userId),
          inArray(personFollows.personId, personIds),
        ),
      )
      .all();
    return new Set(rows.map((r) => r.personId));
  });
}

export async function getFollowedPeople(
  userId: string,
): Promise<FollowedPerson[]> {
  return traceDbQuery("getFollowedPeople", async () => {
    return getDb()
      .select({
        id: personFollows.personId,
        name: personFollows.name,
        profile_path: personFollows.profilePath,
      })
      .from(personFollows)
      .where(eq(personFollows.userId, userId))
      .orderBy(asc(personFollows.name))
      .limit(MAX_FOLLOWED_PEOPLE)
      .all();
  });
}

export async function listFollowedPersonIds(): Promise<number[]> {
  return traceDbQuery("listFollowedPersonIds", async () => {
    const rows = await getDb()
      .selectDistinct({ personId: personFollows.personId })
      .from(personFollows)
      .all();
    return rows.map((r) => r.personId);
  });
}

export async function getPersonFollowers(
  personId: number,
): Promise<Array<{ userId: string; seenCredits: string[] }>> {
  return traceDbQuery("getPersonFollowers", async () => {
    const rows = await getDb()
      .select({
        userId: personFollows.userId,
        seenCredits: personFollows.seenCredits,
      })
      .from(personFollows)
      .where(eq(personFollows.personId, personId))
      .all();
    return rows.map((r) => ({
      userId: r.userId,
      seenCredits: JSON.parse(r.seenCredits) as string[],
    }));
  });
}

/** Enabled notifier ids of every user following this person, keyed by user. */
export async function getEnabledNotifierIdsForPersonFollowers(
  personId: number,
): Promise<Map<string, string[]>> {
  return traceDbQuery("getEnabledNotifierIdsForPersonFollowers", async () => {
    const rows = await getDb()
      .select({ userId: personFollows.userId, notifierId: notifiers.id })
      .from(personFollows)
      .innerJoin(notifiers, eq(notifiers.userId, personFollows.userId))
      .where(
        and(eq(personFollows.personId, personId), eq(notifiers.enabled, 1)),
      )
      .all();
    const byUser = new Map<string, string[]>();
    for (const r of rows) {
      byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r.notifierId]);
    }
    return byUser;
  });
}

export async function updatePersonFollow(
  userId: string,
  personId: number,
  fields: { name: string; profilePath: string | null; seenCredits: string[] },
) {
  return traceDbQuery("updatePersonFollow", async () => {
    await getDb()
      .update(personFollows)
      .set({
        name: fields.name,
        profilePath: fields.profilePath,
        seenCredits: JSON.stringify(fields.seenCredits),
      })
      .where(
        and(
          eq(personFollows.userId, userId),
          eq(personFollows.personId, personId),
        ),
      )
      .run();
  });
}

export async function insertPersonCreditAlerts(
  notifierIds: string[],
  alerts: PersonCreditAlert[],
) {
  return traceDbQuery("insertPersonCreditAlerts", async () => {
    const db = getDb();
    for (const notifierId of notifierIds) {
      for (const a of alerts) {
        await db
          .insert(personCreditAlerts)
          .values({ notifierId, ...a })
          .onConflictDoNothing()
          .run();
      }
    }
  });
}

export async function listPersonCreditAlerts(
  notifierId: string,
): Promise<PersonCreditAlert[]> {
  return traceDbQuery("listPersonCreditAlerts", async () => {
    return getDb()
      .select({
        personId: personCreditAlerts.personId,
        creditKey: personCreditAlerts.creditKey,
        personName: personCreditAlerts.personName,
        title: personCreditAlerts.title,
        role: personCreditAlerts.role,
        releaseDate: personCreditAlerts.releaseDate,
        posterPath: personCreditAlerts.posterPath,
      })
      .from(personCreditAlerts)
      .where(eq(personCreditAlerts.notifierId, notifierId))
      .orderBy(asc(personCreditAlerts.createdAt))
      .all();
  });
}

/** Delete exactly the alerts that were sent, so rows added mid-send survive. */
export async function deletePersonCreditAlerts(
  notifierId: string,
  sent: Array<Pick<PersonCreditAlert, "personId" | "creditKey">>,
) {
  if (sent.length === 0) return;
  return traceDbQuery("deletePersonCreditAlerts", async () => {
    const db = getDb();
    // ponytail: one DELETE per row keeps under D1's 100-param limit; batch if digests grow large.
    for (const a of sent) {
      await db
        .delete(personCreditAlerts)
        .where(
          and(
            eq(personCreditAlerts.notifierId, notifierId),
            eq(personCreditAlerts.personId, a.personId),
            eq(personCreditAlerts.creditKey, a.creditKey),
          ),
        )
        .run();
    }
  });
}
