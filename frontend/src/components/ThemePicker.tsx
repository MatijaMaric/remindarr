import { SaveFeedback, useSettingsSave } from "./settings/SaveFeedback";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import * as api from "../api";
import { useTheme, type Theme } from "../hooks/useTheme";
import { cn } from "@/lib/utils";

interface ThemeMeta {
  value: Theme;
  labelKey: string;
  bg: string;
  fg: string;
  grid: string;
}

const THEMES: ThemeMeta[] = [
  {
    value: "dark",
    labelKey: "settings.theme.dark",
    bg: "#09090b",
    fg: "#fbbf24",
    grid: "#27272a",
  },
  {
    value: "light",
    labelKey: "settings.theme.light",
    bg: "#fafafa",
    fg: "#b45309",
    grid: "#e4e4e7",
  },
  {
    value: "oled",
    labelKey: "settings.theme.oled",
    bg: "#000000",
    fg: "#fbbf24",
    grid: "#111111",
  },
  {
    value: "midnight",
    labelKey: "settings.theme.midnight",
    bg: "#0d0f1a",
    fg: "#818cf8",
    grid: "#1e2238",
  },
  {
    value: "moss",
    labelKey: "settings.theme.moss",
    bg: "#0c1209",
    fg: "#4ade80",
    grid: "#1d2418",
  },
  {
    value: "plum",
    labelKey: "settings.theme.plum",
    bg: "#120b18",
    fg: "#c084fc",
    grid: "#241630",
  },
  {
    value: "auto",
    labelKey: "settings.theme.auto",
    bg: "#18181b",
    fg: "#a1a1aa",
    grid: "#3f3f46",
  },
];

export default function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const feedback = useSettingsSave();

  return (
    <fieldset disabled={feedback.status === "saving"}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {THEMES.map((meta) => {
          const isActive = theme === meta.value;
          const label = t(meta.labelKey);
          return (
            <button
              key={meta.value}
              onClick={() => {
                setTheme(meta.value);
                void feedback.save(async () => {
                  const updated = await api.updateAppearanceSettings({
                    themeVariant: meta.value,
                  });
                  qc.setQueryData(["appearance-settings"], updated);
                });
              }}
              aria-pressed={isActive}
              aria-label={label}
              className={cn(
                "p-3 rounded-[10px] border text-left transition-colors cursor-pointer",
                isActive
                  ? "bg-primary-soft border-primary-border"
                  : "bg-muted border-transparent hover:bg-muted/80",
              )}
            >
              <div
                aria-hidden="true"
                className="relative h-[70px] rounded-sm mb-2.5 overflow-hidden border border-border"
                style={{ background: meta.bg }}
              >
                <div
                  className="absolute top-2 left-2 w-5 h-1 rounded-sm"
                  style={{ background: meta.fg }}
                />
                <div
                  className="absolute top-[17px] left-2 right-2 h-[2px] rounded-sm"
                  style={{ background: meta.grid }}
                />
                <div
                  className="absolute bottom-2 left-2 right-[40px] h-[22px] rounded-sm"
                  style={{ background: meta.grid }}
                />
                <div
                  className="absolute bottom-2 right-2 w-[26px] h-[22px] rounded-sm opacity-40"
                  style={{ background: meta.fg }}
                />
              </div>
              <div className="flex items-center justify-between gap-1">
                <span
                  className={cn(
                    "text-[12px] font-semibold truncate",
                    isActive ? "text-primary-text" : "text-foreground",
                  )}
                >
                  {label}
                </span>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-[11px] font-bold tracking-[0.08em] px-1.5 py-[2px] rounded-full bg-primary-soft text-primary-text border border-primary-border"
                  >
                    ✓
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <SaveFeedback {...feedback} />
    </fieldset>
  );
}
