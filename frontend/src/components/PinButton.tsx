import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "../api";
import { useAuth } from "../context/AuthContext";

interface Props {
  titleId: string;
  isPinned?: boolean;
}

export default function PinButton({
  titleId,
  isPinned: isPinnedProp = false,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [pinned, setPinned] = useState(isPinnedProp);

  useEffect(() => {
    setPinned(isPinnedProp);
  }, [isPinnedProp]);

  const togglePinMutation = useMutation({
    mutationFn: ({ wasPinned }: { wasPinned: boolean }) =>
      wasPinned ? api.unpinTitle(titleId) : api.pinTitle(titleId),
    onMutate: ({ wasPinned }) => setPinned(!wasPinned),
    onSuccess: (_data, { wasPinned }) =>
      toast.success(
        !wasPinned
          ? "Added to pinned favorites"
          : "Removed from pinned favorites",
      ),
    onError: (err, { wasPinned }) => {
      setPinned(wasPinned);
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to update pinned favorites";
      toast.error(msg);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["tracked"] });
      void qc.invalidateQueries({ queryKey: ["home", "auth"] });
    },
  });

  if (!user) return null;

  return (
    <button
      onClick={() => togglePinMutation.mutate({ wasPinned: pinned })}
      disabled={togglePinMutation.isPending}
      aria-pressed={pinned}
      title={pinned ? "Unpin from profile" : "Pin to profile"}
      className={`min-h-8 inline-flex items-center justify-center px-3 py-1.5 rounded-sm text-xs font-medium transition-colors cursor-pointer ${
        pinned
          ? "bg-primary-soft text-primary-text border border-primary-border hover:bg-destructive-soft hover:text-destructive hover:border-destructive/40"
          : "bg-muted text-muted-foreground hover:bg-muted-hover border border-transparent"
      } disabled:opacity-50`}
    >
      {togglePinMutation.isPending ? "..." : pinned ? "📌 Pinned" : "📌 Pin"}
    </button>
  );
}
