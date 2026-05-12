import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogClose,
} from "./ui/alert-dialog";
import { Calendar } from "./ui/calendar";
import { Button } from "./ui/button";
import * as api from "../api";

interface Props {
  open: boolean;
  onClose: () => void;
  entryId: string;
  currentWatchedAt: string;
  anchorDate?: string | null;
  onUpdated: (newWatchedAt: string) => void;
}

function toDate(watchedAt: string): Date {
  return new Date(watchedAt.slice(0, 10) + "T00:00:00");
}

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function EditWatchedAtDialog({ open, onClose, entryId, currentWatchedAt, anchorDate, onUpdated }: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Date | undefined>(toDate(currentWatchedAt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function pickQuick(offsetDays: number) {
    const d = new Date(today);
    d.setDate(d.getDate() - offsetDays);
    setSelected(d);
  }

  function pickAnchor() {
    if (!anchorDate) return;
    setSelected(new Date(anchorDate + "T00:00:00"));
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.patchWatchHistoryEntry(entryId, toYMD(selected));
      onUpdated(result.watchedAt);
      window.dispatchEvent(new CustomEvent("watch-history:updated"));
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogPopup className="max-w-sm space-y-4">
        <AlertDialogTitle>{t("watchedAt.editTitle", "Edit watched date")}</AlertDialogTitle>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => pickQuick(0)}
            className="min-h-7 px-3 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            {t("watchedAt.today", "Today")}
          </button>
          <button
            onClick={() => pickQuick(1)}
            className="min-h-7 px-3 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            {t("watchedAt.yesterday", "Yesterday")}
          </button>
          <button
            onClick={() => pickQuick(7)}
            className="min-h-7 px-3 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            {t("watchedAt.lastWeek", "Last week")}
          </button>
          {anchorDate && (
            <button
              onClick={pickAnchor}
              className="min-h-7 px-3 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer"
            >
              {t("watchedAt.onRelease", "On release")}
            </button>
          )}
        </div>

        <Calendar
          mode="single"
          selected={selected}
          onSelect={setSelected}
          disabled={{ after: today }}
          className="rounded-md"
        />

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex justify-end gap-2">
          <AlertDialogClose
            onClick={onClose}
            className="min-h-8 px-3 py-1.5 rounded-md text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            {t("watchedAt.cancel", "Cancel")}
          </AlertDialogClose>
          <Button onClick={handleSave} disabled={!selected || saving} size="sm">
            {saving ? "…" : t("watchedAt.save", "Save")}
          </Button>
        </div>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
