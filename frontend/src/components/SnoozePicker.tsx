import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { BellOff, Bell } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "../api";

interface Props {
  titleId: string;
  snoozeUntil: string | null | undefined;
  releaseDate?: string | null;
  onSnoozed?: () => void;
}

type SnoozeType = "1d" | "1w" | "release" | "clear";

interface SnoozeOption {
  labelKey: string;
  type: SnoozeType;
  show?: boolean;
}

function computeUntil(
  type: SnoozeType,
  releaseDate?: string | null,
): string | null {
  if (type === "1d") return new Date(Date.now() + 86400000).toISOString();
  if (type === "1w") return new Date(Date.now() + 7 * 86400000).toISOString();
  if (type === "release" && releaseDate)
    return new Date(releaseDate + "T00:00:00.000Z").toISOString();
  return null;
}

export default function SnoozePicker({
  titleId,
  snoozeUntil,
  releaseDate,
  onSnoozed,
}: Props) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const qc = useQueryClient();

  const isSnoozed = snoozeUntil != null && new Date(snoozeUntil) > new Date();

  const snoozeMutation = useMutation({
    mutationFn: ({ until }: { until: string | null }) =>
      api.setTitleSnooze(titleId, until),
    onSuccess: () => onSnoozed?.(),
    onError: () => toast.error("Failed to snooze title"),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["tracked"] });
      void qc.invalidateQueries({ queryKey: ["home", "auth"] });
    },
  });

  const options: SnoozeOption[] = [
    { labelKey: "snooze.oneDay", type: "1d" },
    { labelKey: "snooze.oneWeek", type: "1w" },
    ...(releaseDate
      ? [{ labelKey: "snooze.untilRelease", type: "release" as SnoozeType }]
      : []),
    { labelKey: "snooze.clear", type: "clear", show: isSnoozed },
  ];

  const visibleOptions = options.filter((o) => o.show !== false);

  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
      <Menu.Trigger
        aria-expanded={open}
        type="button"
        title={isSnoozed ? t("snooze.snoozed") : t("snooze.snooze")}
        aria-label={isSnoozed ? t("snooze.snoozed") : t("snooze.snooze")}
        aria-pressed={isSnoozed}
        disabled={snoozeMutation.isPending}
        className={`flex items-center justify-center gap-1 rounded px-1.5 py-1 text-xs transition-colors border ${
          isSnoozed
            ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
            : "text-zinc-500 hover:text-zinc-300 border-transparent hover:border-zinc-700"
        }`}
      >
        {isSnoozed ? (
          <BellOff className="w-3.5 h-3.5" />
        ) : (
          <Bell className="w-3.5 h-3.5" />
        )}
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner
          side="top"
          align="start"
          sideOffset={4}
          className="z-50"
        >
          <Menu.Popup className="min-w-[140px] bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
            {visibleOptions.map((opt) => (
              <Menu.Item
                key={opt.labelKey}
                onClick={() =>
                  snoozeMutation.mutate({
                    until: computeUntil(opt.type, releaseDate),
                  })
                }
                className="w-full text-left text-xs px-3 py-2 outline-none data-[highlighted]:bg-zinc-700 transition-colors text-zinc-300"
              >
                {t(opt.labelKey)}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
