import { useState, useEffect, useCallback } from "react";
import { HeartCrack, ThumbsDown, ThumbsUp, Heart } from "lucide-react";
import { toast } from "sonner";
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
  { value: "HATE", Icon: HeartCrack, label: "Hate", activeColor: "text-white", activeBg: "bg-red-500", filled: true },
  { value: "DISLIKE", Icon: ThumbsDown, label: "Dislike", activeColor: "text-white", activeBg: "bg-orange-500" },
  { value: "LIKE", Icon: ThumbsUp, label: "Like", activeColor: "text-white", activeBg: "bg-blue-500" },
  { value: "LOVE", Icon: Heart, label: "Love", activeColor: "text-white", activeBg: "bg-pink-500", filled: true },
];

export default function EpisodeRatingButtons({ episodeId }: EpisodeRatingButtonsProps) {
  const { user } = useAuth();
  const [ratingData, setRatingData] = useState<EpisodeRatingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [showReview, setShowReview] = useState(false);

  const fetchRating = useCallback(async () => {
    try {
      const data = await api.getEpisodeRating(episodeId);
      setRatingData(data);
      if (data.user_review) {
        setReviewText(data.user_review);
        setShowReview(true);
      }
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, [episodeId]);

  useEffect(() => {
    fetchRating();
  }, [fetchRating]);

  async function handleRate(value: RatingValue) {
    if (submitting || !user) return;

    const isActive = ratingData?.user_rating === value;
    setSubmitting(true);

    try {
      if (isActive) {
        await api.unrateEpisode(episodeId);
        setRatingData((prev) => prev ? { ...prev, user_rating: null, user_review: null } : prev);
        setReviewText("");
        setShowReview(false);
        toast.success("Rating removed");
      } else {
        await api.rateEpisode(episodeId, value, reviewText || undefined);
        setRatingData((prev) => prev ? { ...prev, user_rating: value } : prev);
        setShowReview(true);
        toast.success("Rating saved");
      }
      const updated = await api.getEpisodeRating(episodeId);
      setRatingData(updated);
    } catch {
      toast.error("Failed to update rating");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReviewSave() {
    if (submitting || !user || !ratingData?.user_rating) return;
    setSubmitting(true);
    try {
      await api.rateEpisode(episodeId, ratingData.user_rating, reviewText || undefined);
      toast.success("Review saved");
    } catch {
      toast.error("Failed to save review");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2" data-testid="episode-rating-loading">
        {RATING_CONFIG.map(({ value }) => (
          <div key={value} className="h-9 w-16 rounded-lg bg-zinc-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!ratingData) return null;

  const isReadOnly = !user;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {RATING_CONFIG.map(({ value, Icon, label, activeColor, activeBg, filled }) => {
          const isActive = ratingData.user_rating === value;
          const cnt = ratingData.aggregated[value] || 0;

          return (
            <button
              key={value}
              onClick={() => handleRate(value)}
              disabled={submitting || isReadOnly}
              aria-label={label}
              aria-pressed={isActive}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                isActive
                  ? `${activeBg} ${activeColor}`
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
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
        })}
      </div>

      {/* Review input — shown when the user has rated */}
      {showReview && user && ratingData.user_rating && (
        <div className="space-y-1.5">
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value.slice(0, 500))}
            placeholder="Add a short review… (optional)"
            rows={2}
            className="w-full bg-zinc-800 text-zinc-200 text-sm rounded-lg border border-white/[0.06] px-3 py-2 placeholder-zinc-600 focus:border-amber-500/50 focus:outline-none resize-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-600">{reviewText.length}/500</span>
            <button
              onClick={handleReviewSave}
              disabled={submitting}
              className="text-xs text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50 cursor-pointer"
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

function EpisodeFriendsRatings({ ratings }: { ratings: EpisodeRatingResponse["friends_ratings"] }) {
  const ratingLabels: Record<RatingValue, string> = {
    HATE: "hated",
    DISLIKE: "disliked",
    LIKE: "liked",
    LOVE: "loved",
  };

  const parts = ratings.map((fr) => `${fr.user.username} ${ratingLabels[fr.rating]}`);
  const visible = parts.slice(0, 3);
  const remaining = parts.length - visible.length;

  return (
    <p className="text-xs text-zinc-400" data-testid="episode-friends-ratings">
      Friends: {visible.join(", ")}
      {remaining > 0 && ` +${remaining} more`}
    </p>
  );
}
