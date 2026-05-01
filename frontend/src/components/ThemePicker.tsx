import { useTranslation } from "react-i18next";
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
  { value: "dark",     labelKey: "settings.theme.dark",     bg: "#09090b", fg: "#fbbf24", grid: "#27272a" },
  { value: "light",    labelKey: "settings.theme.light",    bg: "#fafafa", fg: "#b45309", grid: "#e4e4e7" },
  { value: "oled",     labelKey: "settings.theme.oled",     bg: "#000000", fg: "#fbbf24", grid: "#111111" },
  { value: "midnight", labelKey: "settings.theme.midnight", bg: "#0d0f1a", fg: "#818cf8", grid: "#1e2238" },
  { value: "moss",     labelKey: "settings.theme.moss",     bg: "#0c1209", fg: "#4ade80", grid: "#1d2418" },
  { value: "plum",     labelKey: "settings.theme.plum",     bg: "#120b18", fg: "#c084fc", grid: "#241630" },
  { value: "auto",     labelKey: "settings.theme.auto",     bg: "#18181b", fg: "#a1a1aa", grid: "#3f3f46" },
];

export default function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {THEMES.map((meta) => {
        const isActive = theme === meta.value;
        const label = t(meta.labelKey);
        return (
          <button
            key={meta.value}
            onClick={() => setTheme(meta.value)}
            aria-pressed={isActive}
            aria-label={label}
            className={cn(
              "p-3 rounded-[10px] border text-left transition-colors cursor-pointer",
              isActive
                ? "bg-amber-400/[0.08] border-amber-400/30"
                : "bg-zinc-800 border-transparent hover:bg-zinc-800/80",
            )}
          >
            <div
              aria-hidden="true"
              className="relative h-[70px] rounded-md mb-2.5 overflow-hidden border border-white/[0.06]"
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
                className="absolute bottom-2 left-2 right-[40px] h-[22px] rounded"
                style={{ background: meta.grid }}
              />
              <div
                className="absolute bottom-2 right-2 w-[26px] h-[22px] rounded opacity-40"
                style={{ background: meta.fg }}
              />
            </div>
            <div className="flex items-center justify-between gap-1">
              <span
                className={cn(
                  "text-[12px] font-semibold truncate",
                  isActive ? "text-amber-400" : "text-zinc-100",
                )}
              >
                {label}
              </span>
              {isActive && (
                <span
                  aria-hidden="true"
                  className="shrink-0 font-mono text-[9px] font-bold uppercase tracking-[0.08em] px-1.5 py-[2px] rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/30"
                >
                  ✓
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
