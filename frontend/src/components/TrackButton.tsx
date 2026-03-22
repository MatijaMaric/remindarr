import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import * as api from "../api";
import type { Title } from "../types";
import { useAuth } from "../context/AuthContext";

interface Props {
  titleId: string;
  isTracked: boolean;
  onToggle?: (tracked: boolean) => void;
  titleData?: Title;
}

export default function TrackButton({ titleId, isTracked, onToggle, titleData }: Props) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [tracked, setTracked] = useState(isTracked);
  const [loading, setLoading] = useState(false);

  if (!user) return null;

  async function toggle() {
    setLoading(true);
    try {
      if (tracked) {
        await api.untrackTitle(titleId);
        setTracked(false);
        onToggle?.(false);
        toast.success("Removed from tracked");
      } else {
        await api.trackTitle(titleId, undefined, titleData);
        setTracked(true);
        onToggle?.(true);
        toast.success("Title tracked");
      }
    } catch (err) {
      console.error("Track toggle failed:", err);
      toast.error(tracked ? "Failed to untrack — please try again" : "Failed to track — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      aria-pressed={tracked}
      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
        tracked
          ? "bg-indigo-600 text-white hover:bg-red-600"
          : "bg-gray-700 text-gray-300 hover:bg-indigo-600 hover:text-white"
      } disabled:opacity-50`}
    >
      {loading ? "..." : tracked ? t("track.tracked") : t("track.track")}
    </button>
  );
}
