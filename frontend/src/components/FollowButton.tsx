import { useState } from "react";
import { toast } from "sonner";
import * as api from "../api";
import { useAuth } from "../context/AuthContext";

interface Props {
  userId: string;
  initialIsFollowing: boolean;
  onToggle?: (isFollowing: boolean) => void;
}

export default function FollowButton({ userId, initialIsFollowing, onToggle }: Props) {
  const { user } = useAuth();
  const [following, setFollowing] = useState(initialIsFollowing);
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(false);

  // Don't render if not authenticated or viewing own profile
  if (!user || user.id === userId) return null;

  async function handleClick() {
    setLoading(true);
    try {
      if (following) {
        await api.unfollowUser(userId);
        setFollowing(false);
        onToggle?.(false);
        toast.success("Unfollowed");
      } else {
        await api.followUser(userId);
        setFollowing(true);
        onToggle?.(true);
        toast.success("Following");
      }
    } catch (err: unknown) {
      console.error("Follow toggle failed:", err);
      toast.error("Failed to update follow status");
    } finally {
      setLoading(false);
    }
  }

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
      onClick={handleClick}
      disabled={loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`min-h-8 inline-flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${className} disabled:opacity-50`}
    >
      {label}
    </button>
  );
}
