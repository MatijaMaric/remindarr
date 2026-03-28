import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import * as api from "../api";
import { useAuth } from "../context/AuthContext";

interface Props {
  titleId: string;
  isPublic: boolean;
  isTracked: boolean;
  onToggle?: (isPublic: boolean) => void;
  variant?: "button" | "overlay";
}

export default function VisibilityButton({ titleId, isPublic, isTracked, onToggle, variant = "button" }: Props) {
  const { user } = useAuth();
  const [publicState, setPublicState] = useState(isPublic);
  const [loading, setLoading] = useState(false);

  if (!user || !isTracked) return null;

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
      const newState = !publicState;
      await api.updateTitleVisibility(titleId, newState);
      setPublicState(newState);
      onToggle?.(newState);
      toast.success(newState ? "Visible on profile" : "Hidden from profile");
    } catch {
      toast.error("Failed to update visibility");
    } finally {
      setLoading(false);
    }
  }

  const Icon = publicState ? Eye : EyeOff;

  if (variant === "overlay") {
    return (
      <button
        onClick={toggle}
        disabled={loading}
        className={`absolute top-2 right-2 z-10 p-1.5 rounded-full transition-colors ${
          publicState
            ? "bg-zinc-900/70 text-zinc-300 hover:bg-zinc-900/90 hover:text-white"
            : "bg-red-500/80 text-white hover:bg-red-500"
        } disabled:opacity-50`}
        title={publicState ? "Visible on profile — click to hide" : "Hidden from profile — click to show"}
      >
        <Icon className="size-4" />
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`min-h-8 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
        publicState
          ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
          : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
      } disabled:opacity-50`}
      title={publicState ? "Visible on profile — click to hide" : "Hidden from profile — click to show"}
    >
      <Icon className="size-3.5" />
      {publicState ? "Public" : "Hidden"}
    </button>
  );
}
