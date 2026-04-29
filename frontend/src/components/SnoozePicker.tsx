import { useState } from "react";
import { BellOff, Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import * as api from "../api";

interface Props {
  titleId: string;
  snoozeUntil: string | null | undefined;
  releaseDate?: string | null;
  onSnoozed?: () => void;
}

interface SnoozeOption {
  labelKey: string;
  getUntil: () => string | null;
  show?: boolean;
}

export default function SnoozePicker({ titleId, snoozeUntil, releaseDate, onSnoozed }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  const isSnoozed = snoozeUntil != null && new Date(snoozeUntil) > new Date();

  const options: SnoozeOption[] = [
    {
      labelKey: "snooze.oneDay",
      getUntil: () => new Date(Date.now() + 86400000).toISOString(),
    },
    {
      labelKey: "snooze.oneWeek",
      getUntil: () => new Date(Date.now() + 7 * 86400000).toISOString(),
    },
    ...(releaseDate
      ? [
          {
            labelKey: "snooze.untilRelease",
            getUntil: () => new Date(releaseDate + "T00:00:00.000Z").toISOString(),
          },
        ]
      : []),
    {
      labelKey: "snooze.clear",
      getUntil: () => null,
      show: isSnoozed,
    },
  ];

  async function handleSelect(getUntil: () => string | null) {
    setOpen(false);
    setLoading(true);
    const until = getUntil();
    try {
      await api.setTitleSnooze(titleId, until);
      onSnoozed?.();
    } catch (err) {
      console.error("Failed to update snooze", err);
    } finally {
      setLoading(false);
    }
  }

  const visibleOptions = options.filter((o) => o.show !== false);

  return (
    <div className="relative">
      <button
        type="button"
        title={isSnoozed ? t("snooze.snoozed") : t("snooze.snooze")}
        aria-label={isSnoozed ? t("snooze.snoozed") : t("snooze.snooze")}
        aria-pressed={isSnoozed}
        disabled={loading}
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        className={`flex items-center justify-center gap-1 rounded px-1.5 py-1 text-xs transition-colors border ${
          isSnoozed
            ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
            : "text-zinc-500 hover:text-zinc-300 border-transparent hover:border-zinc-700"
        }`}
      >
        {isSnoozed ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <ul
            role="listbox"
            className="absolute bottom-full mb-1 left-0 z-20 min-w-[140px] bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden"
          >
            {visibleOptions.map((opt) => (
              <li key={opt.labelKey}>
                <button
                  role="option"
                  aria-selected={false}
                  onClick={(e) => {
                    e.preventDefault();
                    handleSelect(opt.getUntil);
                  }}
                  className="w-full text-left text-xs px-3 py-2 hover:bg-zinc-700 transition-colors text-zinc-300"
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
