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
  { value: "dark",  labelKey: "settings.theme.dark",  bg: "#09090b", fg: "#fbbf24", grid: "#27272a" },
  { value: "light", labelKey: "settings.theme.light", bg: "#fafafa", fg: "#b45309", grid: "#e4e4e7" },
  { value: "oled",  labelKey: "settings.theme.oled",  bg: "#000000", fg: "#fbbf24", grid: "#111111" },
];

export default function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              className="relative h-[90px] rounded-md mb-2.5 overflow-hidden border border-white/[0.06]"
              style={{ background: meta.bg }}
            >
              <div
                className="absolute top-2.5 left-2.5 w-6 h-1 rounded-sm"
                style={{ background: meta.fg }}
              />
              <div
                className="absolute top-[22px] left-2.5 right-2.5 h-[3px] rounded-sm"
                style={{ background: meta.grid }}
              />
              <div
                className="absolute bottom-2.5 left-2.5 right-[50px] h-[30px] rounded"
                style={{ background: meta.grid }}
              />
              <div
                className="absolute bottom-2.5 right-2.5 w-[34px] h-[30px] rounded opacity-40"
                style={{ background: meta.fg }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  "text-[13px] font-semibold",
                  isActive ? "text-amber-400" : "text-zinc-100",
                )}
              >
                {label}
              </span>
              {isActive && (
                <span
                  aria-hidden="true"
                  className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] px-2 py-[2px] rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/30"
                >
                  Active
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
