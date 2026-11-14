import { useState, useEffect } from "react";
import { HeartCrack, ThumbsDown, ThumbsUp, Heart } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "../api";
import type { RatingValue, EpisodeRatingResponse } from "../types";
import { useAuth } from "../context/AuthContext";

interface EpisodeRatingButtonsProps {
  episodeId: number;
}

const RATING_CONFIG: {
  value: RatingValue;
  Icon: typeof ThumbsDown;
  label: string;
  activeColor: string;
  activeBg: string;
  filled?: boolean;
}[] = [
  {
    value: "HATE",
    Icon: HeartCrack,
    label: "Hate",
    activeColor: "text-foreground",
    activeBg: "bg-red-500",
    filled: true,
  },
  {
    value: "DISLIKE",
    Icon: ThumbsDown,
    label: "Dislike",
    activeColor: "text-foreground",
    activeBg: "bg-orange-500",
  },
  {
    value: "LIKE",
    Icon: ThumbsUp,
    label: "Like",
    activeColor: "text-foreground",
    activeBg: "bg-blue-500",
  },
  {
    value: "LOVE",
    Icon: Heart,
    label: "Love",
    activeColor: "text-foreground",
    activeBg: "bg-pink-500",
    filled: true,
  },
];

export default function EpisodeRatingButtons({
  episodeId,
}: EpisodeRatingButtonsProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [reviewText, setReviewText] = useState("");
  const [showReview, setShowReview] = useState(false);

  const { data: ratingData, isLoading } = useQuery({
    queryKey: ["episode-rating", episodeId],
    queryFn: ({ signal }) => api.getEpisodeRating(episodeId, signal),
  });

  // Sync reviewText and showReview when data loads with an existing review
  useEffect(() => {
    if (ratingData?.user_review) {
      setReviewText(ratingData.user_review); // eslint-disable-line react-hooks/set-state-in-effect -- syncing server-backed initial value into controlled input
      setShowReview(true);
    }
  }, [ratingData?.user_review]);

  const rateMutation = useMutation({
    mutationFn: ({ value, review }: { value: RatingValue; review?: string }) =>
      api.rateEpisode(episodeId, value, review),
    onSuccess: () => {
      setShowReview(true);
      toast.success("Rating saved");
    },
    onError: () => toast.error("Failed to update rating"),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["episode-rating", episodeId] });
      void qc.invalidateQueries({ queryKey: ["season-ratings"] });
      void qc.invalidateQueries({ queryKey: ["show-episode-ratings"] });
    },
  });

  const unrateMutation = useMutation({
    mutationFn: () => api.unrateEpisode(episodeId),
    onSuccess: () => {
      setShowReview(false);
      setReviewText("");
      toast.success("Rating removed");
    },
    onError: () => toast.error("Failed to update rating"),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["episode-rating", episodeId] });
      void qc.invalidateQueries({ queryKey: ["season-ratings"] });
      void qc.invalidateQueries({ queryKey: ["show-episode-ratings"] });
    },
  });

  const submitting = rateMutation.isPending || unrateMutation.isPending;

  async function handleRate(value: RatingValue) {
    if (submitting || !user) return;

    const isActive = ratingData?.user_rating === value;

    if (isActive) {
      unrateMutation.mutate();
    } else {
      rateMutation.mutate({ value, review: reviewText || undefined });
    }
  }

  function handleReviewSave() {
    if (submitting || !user || !ratingData?.user_rating) return;
    rateMutation.mutate({
      value: ratingData.user_rating,
      review: reviewText || undefined,
    });
  }

  if (isLoading) {
    return (
      <div
        className="flex items-center gap-2"
        data-testid="episode-rating-loading"
      >
        {RATING_CONFIG.map(({ value }) => (
          <div
            key={value}
            className="h-9 w-16 rounded-md bg-muted animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!ratingData) return null;

  const isReadOnly = !user;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {RATING_CONFIG.map(
          ({ value, Icon, label, activeColor, activeBg, filled }) => {
            const isActive = ratingData.user_rating === value;
            const cnt = ratingData.aggregated[value] || 0;

            return (
              <button
                key={value}
                onClick={() => handleRate(value)}
                disabled={submitting || isReadOnly}
                aria-label={label}
                aria-pressed={isActive}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                  isActive
                    ? `${activeBg} ${activeColor}`
                    : "bg-muted text-muted-foreground hover:bg-muted-hover hover:text-foreground-secondary"
                } disabled:cursor-default ${isReadOnly ? "" : "disabled:opacity-50"}`}
              >
                <Icon
                  className="w-4 h-4"
                  fill={isActive && filled ? "currentColor" : "none"}
                  strokeWidth={value === "HATE" ? 2.5 : 2}
                />
                {cnt > 0 && <span className="text-xs">{cnt}</span>}
              </button>
            );
          },
        )}
      </div>

      {/* Review input — shown when the user has rated */}
      {showReview && user && ratingData.user_rating && (
        <div className="space-y-1.5">
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value.slice(0, 500))}
            placeholder="Add a short review… (optional)"
            rows={2}
            className="w-full bg-muted text-foreground-secondary text-sm rounded-md border border-border px-3 py-2 placeholder-foreground-disabled focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-border focus-visible:border-primary-border resize-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {reviewText.length}/500
            </span>
            <button
              onClick={handleReviewSave}
              disabled={submitting}
              className="text-xs text-primary-text hover:text-primary-text transition-colors disabled:opacity-50 cursor-pointer"
            >
              Save review
            </button>
          </div>
        </div>
      )}

      {/* Friends' Ratings */}
      {ratingData.friends_ratings.length > 0 && (
        <EpisodeFriendsRatings ratings={ratingData.friends_ratings} />
      )}
    </div>
  );
}

function EpisodeFriendsRatings({
  ratings,
}: {
  ratings: EpisodeRatingResponse["friends_ratings"];
}) {
  const ratingLabels: Record<RatingValue, string> = {
    HATE: "hated",
    DISLIKE: "disliked",
    LIKE: "liked",
    LOVE: "loved",
  };

  const parts = ratings.map(
    (fr) => `${fr.user.username} ${ratingLabels[fr.rating]}`,
  );
  const visible = parts.slice(0, 3);
  const remaining = parts.length - visible.length;

  return (
    <p
      className="text-xs text-muted-foreground"
      data-testid="episode-friends-ratings"
    >
      Friends: {visible.join(", ")}
      {remaining > 0 && ` +${remaining} more`}
    </p>
  );
}
