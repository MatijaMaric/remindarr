import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  const qc = useQueryClient();
  const [tracked, setTracked] = useState(isTracked);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Keep internal state in sync when parent prop changes (e.g., after data refetch)
  useEffect(() => {
    setTracked(isTracked);
  }, [isTracked]);

  const trackMutation = useMutation({
    mutationFn: () => api.trackTitle(titleId, undefined, titleData),
    onMutate: () => setTracked(true),
    onSuccess: () => {
      onToggle?.(true);
      toast.success("Title tracked");
    },
    onError: () => {
      setTracked(false);
      toast.error("Failed to track — please try again");
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["tracked"] }),
  });

  const untrackMutation = useMutation({
    mutationFn: () => api.untrackTitle(titleId),
    onMutate: () => setTracked(false),
    onSuccess: () => {
      onToggle?.(false);
      toast.success("Removed from tracked");
    },
    onError: () => {
      setTracked(true);
      toast.error("Failed to untrack — please try again");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["tracked"] });
      void qc.invalidateQueries({ queryKey: ["home", "auth"] });
    },
  });

  if (!user) return null;

  const loading = trackMutation.isPending || untrackMutation.isPending;

  function handleTrack() {
    trackMutation.mutate();
  }

  function handleUntrack() {
    setConfirmOpen(false);
    untrackMutation.mutate();
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
