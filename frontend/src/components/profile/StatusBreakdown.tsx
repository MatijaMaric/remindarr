import { useTranslation } from "react-i18next";
import { DossierCard } from "./atoms/DossierCard";
import type { ProfileShowsByStatus } from "../../types";

interface StatusBreakdownProps {
  byStatus: ProfileShowsByStatus;
}

interface StatusCell {
  key: keyof ProfileShowsByStatus;
  labelKey: string;
  color: string;
}

const STATUS_CELLS: StatusCell[] = [
  { key: "watching", labelKey: "userProfile.dossier.status.watching", color: "#fbbf24" },
  { key: "caught_up", labelKey: "userProfile.dossier.status.caughtUp", color: "oklch(0.72 0.14 180)" },
  { key: "completed", labelKey: "userProfile.dossier.status.completed", color: "oklch(0.72 0.16 145)" },
  { key: "on_hold", labelKey: "userProfile.dossier.status.onHold", color: "oklch(0.78 0.16 90)" },
  { key: "plan_to_watch", labelKey: "userProfile.dossier.status.planToWatch", color: "oklch(0.68 0.13 240)" },
  { key: "dropped", labelKey: "userProfile.dossier.status.dropped", color: "oklch(0.65 0.18 25)" },
];

export default function StatusBreakdown({ byStatus }: StatusBreakdownProps) {
  const { t } = useTranslation();
  return (
    <DossierCard>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {STATUS_CELLS.map((cell) => (
          <div
            key={cell.key}
            className="bg-zinc-800 rounded-lg px-3.5 py-3 flex flex-col gap-1"
            style={{ borderLeft: `3px solid ${cell.color}` }}
            data-testid={`status-${cell.key}`}
          >
            <div className="text-[22px] font-extrabold tracking-[-0.02em] leading-none text-zinc-100">
              {byStatus[cell.key]}
            </div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
              {t(cell.labelKey)}
            </div>
          </div>
        ))}
      </div>
    </DossierCard>
  );
}
