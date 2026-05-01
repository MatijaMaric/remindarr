import { useTranslation } from "react-i18next";
import type { AccentColor } from "../types";
import { cn } from "@/lib/utils";

interface AccentMeta {
  value: AccentColor;
  labelKey: string;
  hex: string;
}

const ACCENTS: AccentMeta[] = [
  { value: "amber",  labelKey: "settings.accent.amber",  hex: "#fbbf24" },
  { value: "ember",  labelKey: "settings.accent.ember",  hex: "#f97316" },
  { value: "plum",   labelKey: "settings.accent.plum",   hex: "#c084fc" },
  { value: "cobalt", labelKey: "settings.accent.cobalt", hex: "#60a5fa" },
  { value: "moss",   labelKey: "settings.accent.moss",   hex: "#4ade80" },
  { value: "sand",   labelKey: "settings.accent.sand",   hex: "#d4d4aa" },
];

interface Props {
  value: AccentColor;
  onChange: (accent: AccentColor) => void;
}

export default function AccentPicker({ value, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-3">
      {ACCENTS.map((meta) => {
        const isActive = value === meta.value;
        const label = t(meta.labelKey);
        return (
          <button
            key={meta.value}
            onClick={() => onChange(meta.value)}
            aria-pressed={isActive}
            aria-label={label}
            className={cn(
              "flex items-center gap-2.5 px-3.5 py-2.5 rounded-[10px] border text-left transition-colors cursor-pointer",
              isActive
                ? "border-white/20 bg-white/[0.06]"
                : "bg-zinc-800 border-transparent hover:bg-zinc-800/80",
            )}
          >
            <span
              aria-hidden="true"
              className="w-4 h-4 rounded-full shrink-0 ring-2 ring-offset-2 ring-offset-zinc-900"
              style={{
                background: meta.hex,
                // Use CSS custom property to set Tailwind's ring color
                ["--tw-ring-color" as string]: isActive ? meta.hex : "transparent",
              }}
            />
            <span
              className={cn(
                "text-[13px] font-semibold",
                isActive ? "text-zinc-100" : "text-zinc-300",
              )}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
