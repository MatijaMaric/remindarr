import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../schema";
import {
  episodeCommentReactions,
  episodeComments,
  episodes,
  users,
  watchedEpisodes,
} from "../schema";
import { traceDbQuery } from "../../tracing";

export const EPISODE_COMMENT_EMOJIS = ["👍", "❤️", "😂", "😮", "😢"] as const;
export type EpisodeCommentEmoji = (typeof EPISODE_COMMENT_EMOJIS)[number];
export type EpisodeCommentVisibility = "public" | "friends_only";

const COMMENT_LIMIT = 200;

export interface EpisodeCommentView {
  id: string;
  body: string;
  visibility: EpisodeCommentVisibility;
  created_at: string;
  user: {
    id: string;
    username: string;
    display_name: string | null;
    image: string | null;
  };
  reactions: { emoji: string; count: number; reacted: boolean }[];
  can_delete: boolean;
}

export interface EpisodeScope {
  titleId: string;
  seasonNumber: number;
  episodeNumber: number;
}

interface CommentRow {
  id: string;
  userId: string;
  body: string;
  visibility: string;
  createdAt: string | null;
  username: string;
  displayName: string | null;
  image: string | null;
}

function asVisibility(value: string): EpisodeCommentVisibility {
  return value === "friends_only" ? "friends_only" : "public";
}

export async function findEpisodeByScope(
  scope: EpisodeScope,
): Promise<{ id: number } | null> {
  return traceDbQuery("findEpisodeByScope", async () => {
    const db = getDb();
    const row = await db
      .select({ id: episodes.id })
      .from(episodes)
      .where(
        and(
          eq(episodes.titleId, scope.titleId),
          eq(episodes.seasonNumber, scope.seasonNumber),
          eq(episodes.episodeNumber, scope.episodeNumber),
        ),
      )
      .get();
    return row ?? null;
  });
}

export async function userWatchedEpisode(
  userId: string,
  episodeId: number,
): Promise<boolean> {
  return traceDbQuery("userWatchedEpisode", async () => {
    const db = getDb();
    const row = await db
      .select({ episodeId: watchedEpisodes.episodeId })
      .from(watchedEpisodes)
      .where(
        and(
          eq(watchedEpisodes.userId, userId),
          eq(watchedEpisodes.episodeId, episodeId),
        ),
      )
      .get();
    return row !== undefined;
  });
}

async function mutualIdsAmong(
  viewerId: string,
  authorIds: string[],
): Promise<Set<string>> {
  const unique = [...new Set(authorIds.filter((id) => id !== viewerId))];
  if (unique.length === 0) return new Set();
  const db = getDb();
  const rows = await db.all<{ id: string }>(sql`
    SELECT f_out.following_id AS id
    FROM follows AS f_out
    INNER JOIN follows AS f_in
      ON f_in.follower_id = f_out.following_id
     AND f_in.following_id = f_out.follower_id
    WHERE f_out.follower_id = ${viewerId}
      AND f_out.following_id IN (${sql.join(
        unique.map((id) => sql`${id}`),
        sql`, `,
      )})
  `);
  return new Set(rows.map((row) => row.id));
}

function canView(
  row: { userId: string; visibility: string },
  viewerId: string,
  mutual: Set<string>,
): boolean {
  if (row.userId === viewerId) return true;
  if (asVisibility(row.visibility) === "public") return true;
  return mutual.has(row.userId);
}

async function reactionMap(
  commentIds: string[],
  viewerId: string,
): Promise<Map<string, EpisodeCommentView["reactions"]>> {
  const map = new Map<string, EpisodeCommentView["reactions"]>();
  if (commentIds.length === 0) return map;
  const db = getDb();
  const rows = await db
    .select({
      commentId: episodeCommentReactions.commentId,
      emoji: episodeCommentReactions.emoji,
      userId: episodeCommentReactions.userId,
    })
    .from(episodeCommentReactions)
    .where(inArray(episodeCommentReactions.commentId, commentIds))
    .all();

  const counts = new Map<
    string,
    Map<string, { count: number; reacted: boolean }>
  >();
  for (const row of rows) {
    let byEmoji = counts.get(row.commentId);
    if (!byEmoji) {
      byEmoji = new Map();
      counts.set(row.commentId, byEmoji);
    }
    const current = byEmoji.get(row.emoji) ?? { count: 0, reacted: false };
    current.count += 1;
    if (row.userId === viewerId) current.reacted = true;
    byEmoji.set(row.emoji, current);
  }

  for (const id of commentIds) {
    const byEmoji = counts.get(id);
    map.set(
      id,
      EPISODE_COMMENT_EMOJIS.map((emoji) => {
        const current = byEmoji?.get(emoji);
        return {
          emoji,
          count: current?.count ?? 0,
          reacted: current?.reacted ?? false,
        };
      }),
    );
  }
  return map;
}

function toView(
  row: CommentRow,
  viewerId: string,
  reactions: EpisodeCommentView["reactions"],
): EpisodeCommentView {
  return {
    id: row.id,
    body: row.body,
    visibility: asVisibility(row.visibility),
    created_at: row.createdAt ?? "",
    user: {
      id: row.userId,
      username: row.username,
      display_name: row.displayName,
      image: row.image,
    },
    reactions,
    can_delete: row.userId === viewerId,
  };
}

const commentSelect = {
  id: episodeComments.id,
  userId: episodeComments.userId,
  body: episodeComments.body,
  visibility: episodeComments.visibility,
  createdAt: episodeComments.createdAt,
  username: users.username,
  displayName: users.name,
  image: users.image,
};

export async function listEpisodeComments(
  viewerId: string,
  scope: EpisodeScope,
): Promise<EpisodeCommentView[]> {
  return traceDbQuery("listEpisodeComments", async () => {
    const db = getDb();
    const rows = await db
      .select(commentSelect)
      .from(episodeComments)
      .innerJoin(users, eq(users.id, episodeComments.userId))
      .where(
        and(
          eq(episodeComments.titleId, scope.titleId),
          eq(episodeComments.seasonNumber, scope.seasonNumber),
          eq(episodeComments.episodeNumber, scope.episodeNumber),
        ),
      )
      .orderBy(asc(episodeComments.createdAt), asc(episodeComments.id))
      .limit(COMMENT_LIMIT)
      .all();

    const mutual = await mutualIdsAmong(
      viewerId,
      rows.map((row) => row.userId),
    );
    const visible = rows.filter((row) => canView(row, viewerId, mutual));
    const reactions = await reactionMap(
      visible.map((row) => row.id),
      viewerId,
    );
    return visible.map((row) =>
      toView(row, viewerId, reactions.get(row.id) ?? emptyReactions()),
    );
  });
}

function emptyReactions(): EpisodeCommentView["reactions"] {
  return EPISODE_COMMENT_EMOJIS.map((emoji) => ({
    emoji,
    count: 0,
    reacted: false,
  }));
}

export async function createEpisodeComment(
  viewerId: string,
  scope: EpisodeScope,
  body: string,
  visibility: EpisodeCommentVisibility,
): Promise<EpisodeCommentView> {
  return traceDbQuery("createEpisodeComment", async () => {
    const db = getDb();
    const id = crypto.randomUUID();
    await db
      .insert(episodeComments)
      .values({
        id,
        userId: viewerId,
        titleId: scope.titleId,
        seasonNumber: scope.seasonNumber,
        episodeNumber: scope.episodeNumber,
        body,
        visibility,
      })
      .run();
    const row = await db
      .select(commentSelect)
      .from(episodeComments)
      .innerJoin(users, eq(users.id, episodeComments.userId))
      .where(eq(episodeComments.id, id))
      .get();
    if (!row) throw new Error("Failed to load comment");
    return toView(row, viewerId, emptyReactions());
  });
}

export async function deleteOwnEpisodeComment(
  viewerId: string,
  commentId: string,
): Promise<boolean> {
  return traceDbQuery("deleteOwnEpisodeComment", async () => {
    const db = getDb();
    const result = await db
      .delete(episodeComments)
      .where(
        and(
          eq(episodeComments.id, commentId),
          eq(episodeComments.userId, viewerId),
        ),
      )
      .run();
    return Number((result as { changes?: number }).changes ?? 0) > 0;
  });
}

export type ReactionToggleResult =
  | { status: "ok"; comment: EpisodeCommentView }
  | { status: "not_found" }
  | { status: "not_watched" };

export async function toggleEpisodeCommentReaction(
  viewerId: string,
  commentId: string,
  emoji: EpisodeCommentEmoji,
): Promise<ReactionToggleResult> {
  return traceDbQuery("toggleEpisodeCommentReaction", async () => {
    const db = getDb();
    const row = await db
      .select({
        ...commentSelect,
        titleId: episodeComments.titleId,
        seasonNumber: episodeComments.seasonNumber,
        episodeNumber: episodeComments.episodeNumber,
      })
      .from(episodeComments)
      .innerJoin(users, eq(users.id, episodeComments.userId))
      .where(eq(episodeComments.id, commentId))
      .get();
    if (!row) return { status: "not_found" };

    const mutual = await mutualIdsAmong(viewerId, [row.userId]);
    if (!canView(row, viewerId, mutual)) return { status: "not_found" };

    const episodeRow = await findEpisodeByScope({
      titleId: row.titleId,
      seasonNumber: row.seasonNumber,
      episodeNumber: row.episodeNumber,
    });
    if (!episodeRow) return { status: "not_found" };
    if (!(await userWatchedEpisode(viewerId, episodeRow.id))) {
      return { status: "not_watched" };
    }

    const existing = await db
      .select({ emoji: episodeCommentReactions.emoji })
      .from(episodeCommentReactions)
      .where(
        and(
          eq(episodeCommentReactions.commentId, commentId),
          eq(episodeCommentReactions.userId, viewerId),
          eq(episodeCommentReactions.emoji, emoji),
        ),
      )
      .get();

    if (existing) {
      await db
        .delete(episodeCommentReactions)
        .where(
          and(
            eq(episodeCommentReactions.commentId, commentId),
            eq(episodeCommentReactions.userId, viewerId),
            eq(episodeCommentReactions.emoji, emoji),
          ),
        )
        .run();
    } else {
      await db
        .insert(episodeCommentReactions)
        .values({ commentId, userId: viewerId, emoji })
        .run();
    }

    const reactions = await reactionMap([commentId], viewerId);
    return {
      status: "ok",
      comment: toView(
        row,
        viewerId,
        reactions.get(commentId) ?? emptyReactions(),
      ),
    };
  });
}
