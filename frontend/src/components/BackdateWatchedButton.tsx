import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import * as api from "../api";
import { useAuth } from "../context/AuthContext";
import {
  AlertDialog,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogClose,
} from "./ui/alert-dialog";

interface Props {
  titleId?: string;
  scope: "title" | "all";
  variant?: "default" | "ghost";
  onComplete?: (updated: number) => void;
}

export default function BackdateWatchedButton({
  titleId,
  scope,
  variant = "default",
  onComplete,
}: Props) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!user) return null;

  async function handleConfirm() {
    setLoading(true);
    try {
      const { updated } = await api.backdateWatchedToAirDate(titleId);
      setOpen(false);
      if (updated === 0) {
        toast(
          t("episodes.backdateNoChanges", "No watched episodes to backdate"),
        );
      } else {
        toast.success(
          t(
            "episodes.backdateSuccess",
            "Backdated {{count}} episode to air date",
            { count: updated },
          ),
        );
      }
      qc.invalidateQueries({ queryKey: ["watch-history"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["home", "auth"] });
      onComplete?.(updated);
    } catch {
      toast.error(
        t("episodes.backdateError", "Failed to backdate watched episodes"),
      );
    } finally {
      setLoading(false);
    }
  }

  const buttonClass =
    variant === "ghost"
      ? "min-h-8 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer transition-colors"
      : "min-h-8 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium bg-muted text-muted-foreground hover:bg-muted-hover hover:text-foreground cursor-pointer transition-colors";

  const label =
    scope === "all"
      ? t("episodes.backdateAllAction", "Backdate to air dates")
      : t("episodes.backdateAction", "Backdate to air dates");

  const titleKey =
    scope === "all"
      ? "episodes.backdateAllConfirmTitle"
      : "episodes.backdateConfirmTitle";
  const descriptionKey =
    scope === "all"
      ? "episodes.backdateAllConfirmDescription"
      : "episodes.backdateConfirmDescription";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={loading}
        className={`${buttonClass} disabled:opacity-50`}
        title={label}
      >
        <CalendarDays size={13} aria-hidden="true" />
        <span>{label}</span>
      </button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogPopup>
          <AlertDialogTitle>
            {t(
              titleKey,
              scope === "all"
                ? "Backdate all watched episodes?"
                : "Backdate watched episodes?",
            )}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              descriptionKey,
              scope === "all"
                ? "Set the watched timestamp of every watched episode across your tracked shows to that episode's air date. This affects monthly stats."
                : "Set the watched timestamp of every watched episode for this show to its air date. This affects monthly stats.",
            )}
          </AlertDialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialogClose className="inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-xs font-medium bg-muted text-muted-foreground hover:bg-muted-hover cursor-pointer transition-colors">
              {t("common.cancel")}
            </AlertDialogClose>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer transition-colors disabled:opacity-50"
            >
              {loading ? "..." : t("episodes.backdateConfirm", "Backdate")}
            </button>
          </div>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
