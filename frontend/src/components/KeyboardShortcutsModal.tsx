import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Shortcut {
  key: string;
  descKey: string;
}

const SHORTCUTS: Shortcut[] = [
  { key: "?", descKey: "shortcuts.showHelp" },
  { key: "/", descKey: "shortcuts.focusSearch" },
  { key: "j", descKey: "shortcuts.nextTitle" },
  { key: "k", descKey: "shortcuts.prevTitle" },
  { key: "Enter", descKey: "shortcuts.openTitle" },
];

export default function KeyboardShortcutsModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="relative bg-zinc-900 border border-white/[0.08] rounded-2xl p-6 max-w-sm w-full shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 id="shortcuts-title" className="text-base font-semibold">
            {t("shortcuts.title")}
          </h2>
          <button
            onClick={onClose}
            aria-label={t("shortcuts.close")}
            className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-3">
          {SHORTCUTS.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-4">
              <span className="text-sm text-zinc-300">{t(s.descKey)}</span>
              <kbd className="shrink-0 text-xs font-mono bg-zinc-800 border border-white/[0.1] px-2 py-0.5 rounded text-zinc-300">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
