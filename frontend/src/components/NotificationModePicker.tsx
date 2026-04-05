import { useState } from "react";
import { Bell, BellRing, BellOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import * as api from "../api";

interface Props {
  titleId: string;
  currentMode: "all" | "premieres_only" | "none" | null;
  onModeChange?: (mode: "all" | "premieres_only" | "none" | null) => void;
}

type NotificationMode = "all" | "premieres_only" | "none";

const MODES: { value: NotificationMode; icon: typeof Bell; labelKey: string }[] = [
  { value: "all", icon: Bell, labelKey: "notifications.all" },
  { value: "premieres_only", icon: BellRing, labelKey: "notifications.premieres_only" },
  { value: "none", icon: BellOff, labelKey: "notifications.none" },
];

export default function NotificationModePicker({ titleId, currentMode, onModeChange }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<NotificationMode | null>(currentMode ?? null);

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
    </div>
  );
}
