import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "../api";

type UserStatus = "plan_to_watch" | "watching" | "on_hold" | "dropped" | "completed";

interface Props {
  titleId: string;
  objectType: "MOVIE" | "SHOW";
  currentStatus: UserStatus | null | undefined;
  onStatusChange: (status: UserStatus | null) => void;
}

interface StatusOption {
  value: UserStatus | null;
  labelKey: string;
  color: string;
}

const SHOW_OPTIONS: StatusOption[] = [
  { value: null, labelKey: "status.auto", color: "text-zinc-400" },
  { value: "watching", labelKey: "status.watching", color: "text-amber-400" },
  { value: "plan_to_watch", labelKey: "status.planToWatch", color: "text-blue-400" },
  { value: "on_hold", labelKey: "status.onHold", color: "text-yellow-400" },
  { value: "dropped", labelKey: "status.dropped", color: "text-red-400" },
  { value: "completed", labelKey: "status.completed", color: "text-emerald-400" },
];

const MOVIE_OPTIONS: StatusOption[] = [
  { value: null, labelKey: "status.auto", color: "text-zinc-400" },
  { value: "plan_to_watch", labelKey: "status.planToWatch", color: "text-blue-400" },
  { value: "completed", labelKey: "status.completed", color: "text-emerald-400" },
];

export default function StatusPicker({ titleId, objectType, currentStatus, onStatusChange }: Props) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const qc = useQueryClient();

  const options = objectType === "SHOW" ? SHOW_OPTIONS : MOVIE_OPTIONS;
  const activeOption = options.find((o) => o.value === (currentStatus ?? null)) ?? options[0];

  const statusMutation = useMutation({
    mutationFn: (status: UserStatus | null) => api.updateTrackedStatus(titleId, status),
    onMutate: () => setOpen(false),
    onSuccess: (_data, status) => onStatusChange(status),
    onError: () => toast.error("Failed to update status"),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["tracked"] }),
  });

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.preventDefault(); setOpen((v) => !v); }}
        disabled={statusMutation.isPending}
        className={`w-full text-left text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors flex items-center gap-1.5 ${activeOption.color}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex-1 truncate">{t(activeOption.labelKey)}</span>
        <svg className="w-3 h-3 flex-shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <ul
            role="listbox"
            className="absolute bottom-full mb-1 left-0 right-0 z-20 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden"
          >
            {options.map((opt) => (
              <li key={String(opt.value)}>
                <button
                  role="option"
                  aria-selected={opt.value === (currentStatus ?? null)}
                  onClick={(e) => { e.preventDefault(); statusMutation.mutate(opt.value); }}
                  className={`w-full text-left text-xs px-3 py-2 hover:bg-zinc-700 transition-colors ${opt.color} ${opt.value === (currentStatus ?? null) ? "bg-zinc-700" : ""}`}
                >
                  {t(opt.labelKey)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
