import { HeartCrack, ThumbsDown, ThumbsUp, Heart } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "../api";
import type { RatingValue, TitleRatingResponse } from "../types";
import { useAuth } from "../context/AuthContext";

interface RatingButtonsProps {
  titleId: string;
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
    activeColor: "text-white",
    activeBg: "bg-red-500",
    filled: true,
  },
  {
    value: "DISLIKE",
    Icon: ThumbsDown,
    label: "Dislike",
    activeColor: "text-white",
    activeBg: "bg-orange-500",
  },
  {
    value: "LIKE",
    Icon: ThumbsUp,
    label: "Like",
    activeColor: "text-white",
    activeBg: "bg-blue-500",
  },
  {
    value: "LOVE",
    Icon: Heart,
    label: "Love",
    activeColor: "text-white",
    activeBg: "bg-pink-500",
    filled: true,
  },
];

export default function RatingButtons({ titleId }: RatingButtonsProps) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: ratingData, isLoading } = useQuery({
    queryKey: ["title-rating", titleId],
    queryFn: ({ signal }) => api.getTitleRating(titleId, signal),
  });

  const rateMutation = useMutation({
    mutationFn: ({ value }: { value: RatingValue }) => api.rateTitle(titleId, value),
    onSuccess: () => toast.success("Rating saved"),
    onError: () => toast.error("Failed to update rating"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["title-rating", titleId] }),
  });

  const unrateMutation = useMutation({
    mutationFn: () => api.unrateTitle(titleId),
    onSuccess: () => toast.success("Rating removed"),
    onError: () => toast.error("Failed to update rating"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["title-rating", titleId] }),
  });

  const submitting = rateMutation.isPending || unrateMutation.isPending;

  function handleRate(value: RatingValue) {
    if (submitting || !user) return;

    const isActive = ratingData?.user_rating === value;

    if (isActive) {
      unrateMutation.mutate();
    } else {
      rateMutation.mutate({ value });
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2" data-testid="rating-loading">
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
          const count = ratingData.aggregated[value] || 0;

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
              {count > 0 && <span className="text-xs">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Friends' Ratings */}
      {ratingData.friends_ratings.length > 0 && (
        <FriendsRatings ratings={ratingData.friends_ratings} />
      )}
    </div>
  );
}

function FriendsRatings({ ratings }: { ratings: TitleRatingResponse["friends_ratings"] }) {
  const ratingLabels: Record<RatingValue, string> = {
    HATE: "hated",
    DISLIKE: "disliked",
    LIKE: "liked",
    LOVE: "loved",
  };

  const parts = ratings.map(
    (fr) => `${fr.user.username} ${ratingLabels[fr.rating]}`
  );

  // Show up to 3 friends inline, then "+N more"
  const visible = parts.slice(0, 3);
  const remaining = parts.length - visible.length;

  return (
    <p className="text-xs text-zinc-400" data-testid="friends-ratings">
      Friends: {visible.join(", ")}
      {remaining > 0 && ` +${remaining} more`}
    </p>
  );
}
