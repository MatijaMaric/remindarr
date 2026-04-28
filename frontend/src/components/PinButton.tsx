import { useState, useEffect } from "react";
import { toast } from "sonner";
import * as api from "../api";
import { useAuth } from "../context/AuthContext";

interface Props {
  titleId: string;
  isPinned?: boolean;
}

export default function PinButton({ titleId, isPinned: isPinnedProp = false }: Props) {
  const { user } = useAuth();
  const [pinned, setPinned] = useState(isPinnedProp);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPinned(isPinnedProp);
  }, [isPinnedProp]);

  if (!user) return null;

  async function handleClick() {
    setLoading(true);
    try {
      if (pinned) {
        await api.unpinTitle(titleId);
        setPinned(false);
        toast.success("Removed from pinned favorites");
      } else {
        await api.pinTitle(titleId);
        setPinned(true);
        toast.success("Added to pinned favorites");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update pinned favorites";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      aria-pressed={pinned}
      title={pinned ? "Unpin from profile" : "Pin to profile"}
      className={`min-h-8 inline-flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
        pinned
          ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/40"
          : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-transparent"
      } disabled:opacity-50`}
    >
      {loading ? "..." : pinned ? "📌 Pinned" : "📌 Pin"}
    </button>
  );
}
