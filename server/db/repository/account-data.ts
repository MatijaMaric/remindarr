import { eq, inArray, isNotNull, lte, and, getTableName } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import * as s from "../schema";
import { getDb } from "../schema";
import { traceDbQuery } from "../../tracing";

/** Days between a deletion request and the permanent purge. */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

// Every table whose rows belong to one user, with the column that names the
// owner. Credentials (account, passkey, sessions), share/feed tokens, caches
// (plex_library_items) and notifier/integration configs (they hold third-party
// secrets) are deliberately left out.
const OWNED_TABLES: Array<[SQLiteTable, SQLiteColumn]> = [
  [s.tracked, s.tracked.userId],
  [s.watchedTitles, s.watchedTitles.userId],
  [s.watchedEpisodes, s.watchedEpisodes.userId],
  [s.watchHistory, s.watchHistory.userId],
  [s.ratings, s.ratings.userId],
  [s.episodeRatings, s.episodeRatings.userId],
  [s.titleTags, s.titleTags.userId],
  [s.pinnedTitles, s.pinnedTitles.userId],
  [s.ownedMedia, s.ownedMedia.userId],
  [s.recommendations, s.recommendations.fromUserId],
  [s.recommendationReads, s.recommendationReads.userId],
  [s.episodeComments, s.episodeComments.userId],
  [s.episodeCommentReactions, s.episodeCommentReactions.userId],
  [s.follows, s.follows.followerId],
  [s.personFollows, s.personFollows.userId],
  [s.userSubscribedProviders, s.userSubscribedProviders.userId],
  [s.dismissedSuggestions, s.dismissedSuggestions.userId],
  [s.activityKindVisibility, s.activityKindVisibility.userId],
  [s.hiddenActivityEvents, s.hiddenActivityEvents.userId],
  [s.userAchievements, s.userAchievements.userId],
  [s.userStreaks, s.userStreaks.userId],
];

// Profile fields that are secrets or legacy auth state, never exported.
const PROFILE_OMIT = new Set([
  "passwordHash",
  "feedToken",
  "kioskToken",
  "watchlistShareToken",
  "providerSubject",
]);

type Row = Record<string, unknown>;

export interface AccountExport {
  profile: Row;
  notifiers: Row[];
  integrations: Row[];
  tables: Record<string, Row[]>;
}

/**
 * Everything a user owns, for "Download my data". Rows that reference a title
 * gain a `titleName` column so the export is readable without the catalogue.
 */
export async function getAccountExport(
  userId: string,
): Promise<AccountExport | null> {
  return traceDbQuery("getAccountExport", async () => {
    const db = getDb();
    const user = await db
      .select()
      .from(s.users)
      .where(eq(s.users.id, userId))
      .get();
    if (!user) return null;
    const profile = Object.fromEntries(
      Object.entries(user).filter(([k]) => !PROFILE_OMIT.has(k)),
    );

    const tables: Record<string, Row[]> = {};
    for (const [table, owner] of OWNED_TABLES) {
      tables[getTableName(table)] = await db
        .select()
        .from(table)
        .where(eq(owner, userId))
        .all();
    }

    const titleIds = [
      ...new Set(
        Object.values(tables)
          .flat()
          .map((r) => r.titleId)
          .filter((id): id is string => typeof id === "string"),
      ),
    ];
    const names = new Map<string, string>();
    // ponytail: chunked to stay under SQLite's bound-parameter limit.
    for (let i = 0; i < titleIds.length; i += 90) {
      const rows = await db
        .select({ id: s.titles.id, title: s.titles.title })
        .from(s.titles)
        .where(inArray(s.titles.id, titleIds.slice(i, i + 90)))
        .all();
      for (const r of rows) names.set(r.id, r.title);
    }
    for (const rows of Object.values(tables)) {
      for (const r of rows) {
        if (typeof r.titleId === "string")
          r.titleName = names.get(r.titleId) ?? null;
      }
    }

    const notifiers = await db
      .select({
        id: s.notifiers.id,
        provider: s.notifiers.provider,
        name: s.notifiers.name,
        notifyTime: s.notifiers.notifyTime,
        timezone: s.notifiers.timezone,
        enabled: s.notifiers.enabled,
        digestMode: s.notifiers.digestMode,
        digestDay: s.notifiers.digestDay,
      })
      .from(s.notifiers)
      .where(eq(s.notifiers.userId, userId))
      .all();
    const integrations = await db
      .select({
        id: s.integrations.id,
        provider: s.integrations.provider,
        name: s.integrations.name,
        enabled: s.integrations.enabled,
        lastSyncAt: s.integrations.lastSyncAt,
      })
      .from(s.integrations)
      .where(eq(s.integrations.userId, userId))
      .all();

    return { profile, notifiers, integrations, tables };
  });
}

/** The local (username/password) credential hash, or null for SSO/passkey-only users. */
export async function getCredentialPasswordHash(
  userId: string,
): Promise<string | null> {
  return traceDbQuery("getCredentialPasswordHash", async () => {
    const row = await getDb()
      .select({ password: s.account.password })
      .from(s.account)
      .where(
        and(
          eq(s.account.userId, userId),
          eq(s.account.providerId, "credential"),
        ),
      )
      .get();
    return row?.password ?? null;
  });
}

export async function revokeUserSessions(userId: string): Promise<void> {
  return traceDbQuery("revokeUserSessions", async () => {
    await getDb().delete(s.sessions).where(eq(s.sessions.userId, userId)).run();
  });
}

/** Marks the account for deletion and signs it out everywhere. */
export async function requestAccountDeletion(
  userId: string,
  now = new Date(),
): Promise<void> {
  await traceDbQuery("requestAccountDeletion", async () => {
    await getDb()
      .update(s.users)
      .set({ deletionRequestedAt: now.toISOString() })
      .where(eq(s.users.id, userId))
      .run();
  });
  await revokeUserSessions(userId);
}

/** Signing in during the grace period keeps the account. */
export async function cancelAccountDeletion(userId: string): Promise<boolean> {
  return traceDbQuery("cancelAccountDeletion", async () => {
    const db = getDb();
    const row = await db
      .update(s.users)
      .set({ deletionRequestedAt: null })
      .where(
        and(eq(s.users.id, userId), isNotNull(s.users.deletionRequestedAt)),
      )
      .returning({ id: s.users.id })
      .get();
    return !!row;
  });
}

/** Permanently deletes accounts whose grace period has ended. */
export async function purgeDeletedAccounts(now = new Date()): Promise<number> {
  return traceDbQuery("purgeDeletedAccounts", async () => {
    const cutoff = new Date(
      now.getTime() - ACCOUNT_DELETION_GRACE_DAYS * 86_400_000,
    ).toISOString();
    const rows = await getDb()
      .delete(s.users)
      .where(lte(s.users.deletionRequestedAt, cutoff))
      .returning({ id: s.users.id })
      .all();
    return rows.length;
  });
}
