import { useTranslation } from "react-i18next";
import type { Density } from "../types";
import { cn } from "@/lib/utils";

interface DensityMeta {
  value: Density;
  labelKey: string;
  descKey: string;
  rows: number[];
}

const DENSITIES: DensityMeta[] = [
  { value: "comfortable", labelKey: "settings.density.comfortable", descKey: "settings.density.comfortableDesc", rows: [8, 6, 8] },
  { value: "cozy",        labelKey: "settings.density.cozy",        descKey: "settings.density.cozyDesc",        rows: [6, 4, 6] },
  { value: "compact",     labelKey: "settings.density.compact",     descKey: "settings.density.compactDesc",     rows: [4, 3, 4] },
];

interface Props {
  value: Density;
  onChange: (density: Density) => void;
}

export default function DensityPicker({ value, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {DENSITIES.map((meta) => {
        const isActive = value === meta.value;
        return (
          <button
            key={meta.value}
            onClick={() => onChange(meta.value)}
            aria-pressed={isActive}
            aria-label={t(meta.labelKey)}
            className={cn(
              "p-3.5 rounded-[10px] border text-left transition-colors cursor-pointer",
              isActive
                ? "bg-amber-400/[0.08] border-amber-400/30"
                : "bg-zinc-800 border-transparent hover:bg-zinc-800/80",
            )}
          >
            <div aria-hidden="true" className="flex flex-col gap-1 mb-3 px-1">
              {meta.rows.map((h, i) => (
                <div
                  key={i}
                  className="bg-zinc-700 rounded-sm w-full"
                  style={{ height: h }}
                />
              ))}
            </div>
            <div className={cn("text-[13px] font-semibold mb-0.5", isActive ? "text-amber-400" : "text-zinc-100")}>
              {t(meta.labelKey)}
            </div>
            <div className="text-[11px] text-zinc-500">{t(meta.descKey)}</div>
          </button>
        );
      })}
    </div>
  );
}
