import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import * as api from "../api";
import type { EpisodeComment, EpisodeCommentsResponse } from "../types";
import { ApiError } from "../lib/api-error";

interface EpisodeThreadProps {
  titleId: string;
  seasonNumber: number;
  episodeNumber: number;
  signedIn: boolean;
  watched: boolean;
  statusReady: boolean;
}

function commentTime(iso: string): string {
  const normalized = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export default function EpisodeThread({
  titleId,
  seasonNumber,
  episodeNumber,
  signedIn,
  watched,
  statusReady,
}: EpisodeThreadProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"public" | "friends_only">(
    "public",
  );

  const queryKey = ["episode-comments", titleId, seasonNumber, episodeNumber];
  const canRead = signedIn && watched && statusReady;

  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      api.getEpisodeComments(titleId, seasonNumber, episodeNumber, signal),
    enabled: canRead,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey });
    void qc.invalidateQueries({ queryKey: ["activity"] });
  };

  const postMutation = useMutation({
    mutationFn: () =>
      api.postEpisodeComment(
        titleId,
        seasonNumber,
        episodeNumber,
        body.trim(),
        visibility,
      ),
    onSuccess: () => {
      setBody("");
      invalidate();
    },
    onError: () => {
      toast.error(t("episodes.discussion.postError"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (commentId: string) => api.deleteEpisodeComment(commentId),
    onSuccess: invalidate,
    onError: () => {
      toast.error(t("episodes.discussion.deleteError"));
    },
  });

  const reactMutation = useMutation({
    mutationFn: ({ commentId, emoji }: { commentId: string; emoji: string }) =>
      api.toggleEpisodeCommentReaction(commentId, emoji),
    onSuccess: (result) => {
      qc.setQueryData<EpisodeCommentsResponse>(queryKey, (current) => {
        if (!current) return current;
        return {
          ...current,
          comments: current.comments.map((comment) =>
            comment.id === result.comment.id ? result.comment : comment,
          ),
        };
      });
    },
    onError: () => {
      toast.error(t("episodes.discussion.reactError"));
    },
  });

  if (signedIn && !statusReady) return null;

  const blocked =
    !signedIn ||
    !watched ||
    (isError && error instanceof ApiError && error.status === 403);

  return (
    <section className="space-y-3" aria-labelledby="episode-discussion">
      <h2 id="episode-discussion" className="text-lg font-semibold text-white">
        {t("episodes.discussion.title")}
      </h2>

      {blocked ? (
        <p className="text-sm text-zinc-400">
          {signedIn
            ? t("episodes.discussion.watchFirst")
            : t("episodes.discussion.signIn")}
        </p>
      ) : isLoading ? (
        <p className="text-sm text-zinc-500">
          {t("episodes.discussion.loading")}
        </p>
      ) : isError ? (
        <p className="text-sm text-red-400">
          {t("episodes.discussion.loadError")}
        </p>
      ) : (
        <>
          {data && data.comments.length === 0 && (
            <p className="text-sm text-zinc-500">
              {t("episodes.discussion.empty")}
            </p>
          )}
          <ul className="space-y-4">
            {data?.comments.map((comment) => (
              <CommentRow
                key={comment.id}
                comment={comment}
                onDelete={() => deleteMutation.mutate(comment.id)}
                onReact={(emoji) =>
                  reactMutation.mutate({ commentId: comment.id, emoji })
                }
              />
            ))}
          </ul>
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!body.trim() || postMutation.isPending) return;
              postMutation.mutate();
            }}
          >
            <label
              className="block text-sm text-zinc-400"
              htmlFor="episode-comment"
            >
              {t("episodes.discussion.composer")}
            </label>
            <textarea
              id="episode-comment"
              value={body}
              maxLength={280}
              rows={3}
              onChange={(event) => setBody(event.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            />
            <div className="flex items-center gap-3">
              <label
                className="text-sm text-zinc-400"
                htmlFor="episode-comment-visibility"
              >
                {t("episodes.discussion.visibility")}
              </label>
              <select
                id="episode-comment-visibility"
                value={visibility}
                onChange={(event) =>
                  setVisibility(event.target.value as "public" | "friends_only")
                }
                className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-white"
              >
                <option value="public">
                  {t("episodes.discussion.public")}
                </option>
                <option value="friends_only">
                  {t("episodes.discussion.friendsOnly")}
                </option>
              </select>
              <button
                type="submit"
                disabled={postMutation.isPending || body.trim().length === 0}
                className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 disabled:opacity-40"
              >
                {t("episodes.discussion.post")}
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}

function CommentRow({
  comment,
  onDelete,
  onReact,
}: {
  comment: EpisodeComment;
  onDelete: () => void;
  onReact: (emoji: string) => void;
}) {
  const { t } = useTranslation();
  const name = comment.user.display_name || comment.user.username;
  return (
    <li className="space-y-2 border-b border-white/[0.06] pb-4">
      <div className="flex items-baseline gap-2 flex-wrap">
        <Link
          to={`/user/${encodeURIComponent(comment.user.username)}`}
          className="text-sm font-medium text-white hover:text-amber-400"
        >
          {name}
        </Link>
        {comment.visibility === "friends_only" && (
          <span className="text-xs text-zinc-500">
            {t("episodes.discussion.friendsBadge")}
          </span>
        )}
        <time className="text-xs text-zinc-500" dateTime={comment.created_at}>
          {commentTime(comment.created_at)}
        </time>
        {comment.can_delete && (
          <button
            type="button"
            onClick={onDelete}
            className="text-xs text-zinc-500 hover:text-red-400"
          >
            {t("episodes.discussion.delete")}
          </button>
        )}
      </div>
      <p className="text-sm text-zinc-200 whitespace-pre-wrap select-text">
        {comment.body}
      </p>
      <div className="flex flex-wrap gap-2">
        {comment.reactions.map((reaction) => (
          <button
            key={reaction.emoji}
            type="button"
            aria-pressed={reaction.reacted}
            aria-label={t("episodes.discussion.react", {
              emoji: reaction.emoji,
            })}
            onClick={() => onReact(reaction.emoji)}
            className={`rounded-full border px-2 py-0.5 text-sm ${
              reaction.reacted
                ? "border-amber-400/60 bg-amber-400/10 text-white"
                : "border-zinc-700 text-zinc-300"
            }`}
          >
            {reaction.emoji}
            {reaction.count > 0 ? ` ${reaction.count}` : ""}
          </button>
        ))}
      </div>
    </li>
  );
}
