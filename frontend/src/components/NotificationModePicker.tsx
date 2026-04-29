import { useState } from "react";
import { Bell, BellRing, BellOff, BellDot } from "lucide-react";
import { useTranslation } from "react-i18next";
import * as api from "../api";
import SnoozePicker from "./SnoozePicker";

interface Props {
  titleId: string;
  currentMode: "all" | "premieres_only" | "none" | null;
  onModeChange?: (mode: "all" | "premieres_only" | "none" | null) => void;
  snoozeUntil?: string | null;
  remindOnRelease?: boolean;
  releaseDate?: string | null;
  onSnoozed?: () => void;
  onRemindOnReleaseChange?: (enabled: boolean) => void;
}

type NotificationMode = "all" | "premieres_only" | "none";

const MODES: { value: NotificationMode; icon: typeof Bell; labelKey: string }[] = [
  { value: "all", icon: Bell, labelKey: "notifications.all" },
  { value: "premieres_only", icon: BellRing, labelKey: "notifications.premieres_only" },
  { value: "none", icon: BellOff, labelKey: "notifications.none" },
];

export default function NotificationModePicker({ titleId, currentMode, onModeChange, snoozeUntil, remindOnRelease, releaseDate, onSnoozed, onRemindOnReleaseChange }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<NotificationMode | null>(currentMode ?? null);
  const [remind, setRemind] = useState<boolean>(remindOnRelease ?? false);

  async function handleClick(newMode: NotificationMode) {
    const value = newMode === mode ? null : newMode;
    try {
      await api.setNotificationMode(titleId, value);
      setMode(value);
      onModeChange?.(value);
    } catch (err) {
      console.error("Failed to update notification mode", err);
    }
  }

  async function handleRemindToggle() {
    const newValue = !remind;
    try {
      await api.setRemindOnRelease(titleId, newValue);
      setRemind(newValue);
      onRemindOnReleaseChange?.(newValue);
    } catch (err) {
      console.error("Failed to update remind-on-release", err);
    }
  }

  const activeMode = mode ?? "all";

  return (
    <div className="flex gap-1" aria-label={t("notifications.label")}>
      {MODES.map(({ value, icon: Icon, labelKey }) => {
        const isActive = activeMode === value && mode !== null || (value === "all" && mode === null);
        return (
          <button
            key={value}
            type="button"
            title={t(labelKey)}
            aria-label={t(labelKey)}
            aria-pressed={isActive}
            onClick={() => handleClick(value)}
            className={`flex-1 flex items-center justify-center gap-1 rounded px-1.5 py-1 text-xs transition-colors ${
              isActive
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                : "text-zinc-500 hover:text-zinc-300 border border-transparent hover:border-zinc-700"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        );
      })}
      <SnoozePicker
        titleId={titleId}
        snoozeUntil={snoozeUntil}
        releaseDate={releaseDate}
        onSnoozed={onSnoozed}
      />
      {releaseDate && new Date(releaseDate) > new Date() && (
        <button
          type="button"
          title={t("snooze.remindOnRelease")}
          aria-label={t("snooze.remindOnRelease")}
          aria-pressed={remind}
          onClick={handleRemindToggle}
          className={`flex items-center justify-center gap-1 rounded px-1.5 py-1 text-xs transition-colors border ${
            remind
              ? "bg-purple-500/20 text-purple-400 border-purple-500/40"
              : "text-zinc-500 hover:text-zinc-300 border-transparent hover:border-zinc-700"
          }`}
        >
          <BellDot className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
