import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import * as api from "../api";
import type { Title } from "../types";
import { useAuth } from "../context/AuthContext";
import {
  AlertDialog,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogClose,
} from "./ui/alert-dialog";

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
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!user) return null;

  async function handleTrack() {
    setLoading(true);
    try {
      await api.trackTitle(titleId, undefined, titleData);
      setTracked(true);
      onToggle?.(true);
      toast.success("Title tracked");
    } catch (err) {
      console.error("Track toggle failed:", err);
      toast.error("Failed to track — please try again");
    } finally {
      setLoading(false);
    }
  }

  async function handleUntrack() {
    setConfirmOpen(false);
    setLoading(true);
    try {
      await api.untrackTitle(titleId);
      setTracked(false);
      onToggle?.(false);
      toast.success("Removed from tracked");
    } catch (err) {
      console.error("Track toggle failed:", err);
      toast.error("Failed to untrack — please try again");
    } finally {
      setLoading(false);
    }
  }

  function handleClick() {
    if (tracked) {
      setConfirmOpen(true);
    } else {
      handleTrack();
    }
  }

  const titleName = titleData?.title ?? t("track.track");

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        aria-pressed={tracked}
        className={`min-h-8 inline-flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
          tracked
            ? "bg-amber-500 text-zinc-950 hover:bg-red-500"
            : "bg-zinc-800 text-zinc-400 hover:bg-amber-500 hover:text-zinc-950"
        } disabled:opacity-50`}
      >
        {loading ? "..." : tracked ? t("track.tracked") : t("track.track")}
      </button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogPopup>
          <AlertDialogTitle>
            {t("track.confirmUntrack", { title: titleName })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("track.confirmUntrackDescription")}
          </AlertDialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialogClose
              className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 cursor-pointer transition-colors"
            >
              {t("common.cancel")}
            </AlertDialogClose>
            <button
              onClick={handleUntrack}
              className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium bg-red-600 text-white hover:bg-red-700 cursor-pointer transition-colors"
            >
              {t("track.confirm")}
            </button>
          </div>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
