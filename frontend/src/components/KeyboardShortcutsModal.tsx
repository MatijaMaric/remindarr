import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
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
        className="absolute inset-0 bg-scrim backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <Card
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        radius="2xl"
        padding="lg"
        className="relative max-w-sm w-full shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 id="shortcuts-title" className="text-base font-semibold">
            {t("shortcuts.title")}
          </h2>
          <button
            onClick={onClose}
            aria-label={t("shortcuts.close")}
            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-3">
          {SHORTCUTS.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between gap-4"
            >
              <span className="text-sm text-foreground-secondary">
                {t(s.descKey)}
              </span>
              <kbd className="shrink-0 text-xs font-mono bg-muted border border-border px-2 py-0.5 rounded-sm text-foreground-secondary">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
