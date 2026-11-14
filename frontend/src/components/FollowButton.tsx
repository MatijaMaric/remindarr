import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "../api";
import { useAuth } from "../context/AuthContext";

/** Follows a user (`userId`) or a TMDB person (`personId`). */
type Props = (
  | { userId: string; personId?: never }
  | { personId: number; userId?: never }
) & {
  initialIsFollowing: boolean;
  onToggle?: (isFollowing: boolean) => void;
};

export default function FollowButton({
  userId,
  personId,
  initialIsFollowing,
  onToggle,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [following, setFollowing] = useState(initialIsFollowing);
  const [hovered, setHovered] = useState(false);

  const toggleFollowMutation = useMutation({
    mutationFn: ({ wasFollowing }: { wasFollowing: boolean }) => {
      if (personId != null) {
        return wasFollowing
          ? api.unfollowPerson(personId)
          : api.followPerson(personId);
      }
      return wasFollowing ? api.unfollowUser(userId) : api.followUser(userId);
    },
    onMutate: ({ wasFollowing }) => setFollowing(!wasFollowing),
    onSuccess: (_data, { wasFollowing }) => {
      onToggle?.(!wasFollowing);
      toast.success(!wasFollowing ? "Following" : "Unfollowed");
    },
    onError: (_err, { wasFollowing }) => {
      setFollowing(wasFollowing);
      toast.error("Failed to update follow status");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["user-profile"] });
      if (personId != null) {
        void qc.invalidateQueries({ queryKey: ["person"] });
        void qc.invalidateQueries({ queryKey: ["search"] });
      }
    },
  });

  // Don't render if not authenticated or viewing own profile
  if (!user || user.id === userId) return null;

  const loading = toggleFollowMutation.isPending;

  const showUnfollow = following && hovered;

  let label: string;
  if (loading) {
    label = "...";
  } else if (showUnfollow) {
    label = "Unfollow";
  } else if (following) {
    label = "Following";
  } else {
    label = "Follow";
  }

  let className: string;
  if (showUnfollow) {
    className = "bg-destructive-soft text-destructive";
  } else if (following) {
    className = "bg-primary text-primary-foreground";
  } else {
    className =
      "bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground";
  }

  return (
    <button
      onClick={() => toggleFollowMutation.mutate({ wasFollowing: following })}
      disabled={loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`min-h-8 inline-flex items-center justify-center px-3 py-1.5 rounded-sm text-xs font-medium transition-colors cursor-pointer ${className} disabled:opacity-50`}
    >
      {label}
    </button>
  );
}
