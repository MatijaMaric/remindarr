import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "../api";
import { useAuth } from "../context/AuthContext";

interface Props {
  userId: string;
  initialIsFollowing: boolean;
  onToggle?: (isFollowing: boolean) => void;
}

export default function FollowButton({ userId, initialIsFollowing, onToggle }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [following, setFollowing] = useState(initialIsFollowing);
  const [hovered, setHovered] = useState(false);

  const toggleFollowMutation = useMutation({
    mutationFn: ({ wasFollowing }: { wasFollowing: boolean }) =>
      wasFollowing ? api.unfollowUser(userId) : api.followUser(userId),
    onMutate: ({ wasFollowing }) => setFollowing(!wasFollowing),
    onSuccess: (_data, { wasFollowing }) => {
      onToggle?.(!wasFollowing);
      toast.success(!wasFollowing ? "Following" : "Unfollowed");
    },
    onError: (_err, { wasFollowing }) => {
      setFollowing(wasFollowing);
      toast.error("Failed to update follow status");
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["user-profile"] }),
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
    className = "bg-red-500 text-white";
  } else if (following) {
    className = "bg-amber-500 text-zinc-950";
  } else {
    className = "bg-zinc-800 text-zinc-400 hover:bg-amber-500 hover:text-zinc-950";
  }

  return (
    <button
      onClick={() => toggleFollowMutation.mutate({ wasFollowing: following })}
      disabled={loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`min-h-8 inline-flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${className} disabled:opacity-50`}
    >
      {label}
    </button>
  );
}
