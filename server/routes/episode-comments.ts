import { Hono } from "hono";
import { z } from "zod";
import {
  EPISODE_COMMENT_EMOJIS,
  createEpisodeComment,
  deleteOwnEpisodeComment,
  findEpisodeByScope,
  listEpisodeComments,
  toggleEpisodeCommentReaction,
  userWatchedEpisode,
} from "../db/repository";
import type {
  EpisodeCommentEmoji,
  EpisodeCommentVisibility,
} from "../db/repository";
import type { AppEnv } from "../types";
import { logger } from "../logger";
import { ok, err } from "./response";
import { zValidator } from "../lib/validator";

const log = logger.child({ module: "episode-comments" });

const emojiEnum = z.enum(EPISODE_COMMENT_EMOJIS);
const visibilityEnum = z.enum(["public", "friends_only"]);

const listQuerySchema = z.object({
  title_id: z.string().min(1).max(128),
  season_number: z.coerce.number().int().min(0).max(500),
  episode_number: z.coerce.number().int().min(0).max(10000),
});

const createSchema = z.object({
  title_id: z.string().min(1).max(128),
  season_number: z.number().int().min(0).max(500),
  episode_number: z.number().int().min(0).max(10000),
  body: z.string().min(1).max(280),
  visibility: visibilityEnum.optional(),
});

const commentIdParamSchema = z.object({
  id: z.string().uuid(),
});

const reactionSchema = z.object({
  emoji: emojiEnum,
});

const app = new Hono<AppEnv>();

const NOT_WATCHED =
  "Mark this episode as watched before joining the discussion";

app.get("/", zValidator("query", listQuerySchema), async (c) => {
  const user = c.get("user");
  if (!user) return err(c, "Authentication required", 401);

  const scope = c.req.valid("query");
  const episode = await findEpisodeByScope({
    titleId: scope.title_id,
    seasonNumber: scope.season_number,
    episodeNumber: scope.episode_number,
  });
  if (!episode) return err(c, "Episode not found", 404);
  if (!(await userWatchedEpisode(user.id, episode.id))) {
    return err(c, NOT_WATCHED, 403);
  }

  const comments = await listEpisodeComments(user.id, {
    titleId: scope.title_id,
    seasonNumber: scope.season_number,
    episodeNumber: scope.episode_number,
  });
  return ok(c, { emojis: [...EPISODE_COMMENT_EMOJIS], comments });
});

app.post("/", zValidator("json", createSchema), async (c) => {
  const user = c.get("user");
  if (!user) return err(c, "Authentication required", 401);

  const input = c.req.valid("json");
  const body = input.body.trim();
  if (!body) return err(c, "Comment is empty", 400);

  const scope = {
    titleId: input.title_id,
    seasonNumber: input.season_number,
    episodeNumber: input.episode_number,
  };
  const episode = await findEpisodeByScope(scope);
  if (!episode) return err(c, "Episode not found", 404);
  if (!(await userWatchedEpisode(user.id, episode.id))) {
    return err(c, NOT_WATCHED, 403);
  }

  const visibility: EpisodeCommentVisibility = input.visibility ?? "public";
  const comment = await createEpisodeComment(user.id, scope, body, visibility);
  log.info("Episode comment posted", {
    userId: user.id,
    commentId: comment.id,
    titleId: scope.titleId,
    visibility,
  });
  return ok(c, { comment });
});

app.delete("/:id", zValidator("param", commentIdParamSchema), async (c) => {
  const user = c.get("user");
  if (!user) return err(c, "Authentication required", 401);

  const { id } = c.req.valid("param");
  const deleted = await deleteOwnEpisodeComment(user.id, id);
  if (!deleted) return err(c, "Comment not found", 404);
  log.info("Episode comment deleted", { userId: user.id, commentId: id });
  return ok(c, { success: true });
});

app.post(
  "/:id/reactions",
  zValidator("param", commentIdParamSchema),
  zValidator("json", reactionSchema),
  async (c) => {
    const user = c.get("user");
    if (!user) return err(c, "Authentication required", 401);

    const { id } = c.req.valid("param");
    const { emoji } = c.req.valid("json");
    const result = await toggleEpisodeCommentReaction(
      user.id,
      id,
      emoji as EpisodeCommentEmoji,
    );
    if (result.status === "not_found") return err(c, "Comment not found", 404);
    if (result.status === "not_watched") return err(c, NOT_WATCHED, 403);

    log.info("Episode comment reaction toggled", {
      userId: user.id,
      commentId: id,
      emoji,
    });
    return ok(c, { comment: result.comment });
  },
);

export default app;
