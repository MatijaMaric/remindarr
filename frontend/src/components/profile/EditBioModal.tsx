import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import * as api from "../../api";
import { useFocusTrap } from "../../hooks/useFocusTrap";

interface EditBioModalProps {
  initialValue: string;
  onClose: () => void;
  onSaved: (bio: string | null) => void;
}

const MAX_LEN = 280;

export function EditBioModal({ initialValue, onClose, onSaved }: EditBioModalProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Always open while mounted — the parent unmounts us on close
  useFocusTrap(dialogRef, true);

  const tooLong = value.length > MAX_LEN;

  async function handleSave() {
    if (tooLong) return;
    setSaving(true);
    try {
      const next = value.trim() === "" ? null : value;
      const result = await api.updateMyBio(next);
      onSaved(result.bio);
    } catch (err: unknown) {
      console.error("Failed to update bio", err);
      toast.error("Failed to update bio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      aria-hidden="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        data-testid="edit-bio-modal"
        padding="lg"
        className="w-full max-w-md space-y-4"
      >
        <h2 className="text-lg font-semibold text-white">{t("userProfile.dossier.bio")}</h2>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={MAX_LEN + 40 /* tolerate paste, block on save */}
          rows={4}
          placeholder={t("userProfile.dossier.bioPlaceholder")}
          className="w-full px-3 py-2 bg-zinc-950 border border-white/[0.08] rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:border-amber-400/60 resize-none"
          data-testid="bio-textarea"
        />
        <div className="flex items-center justify-between">
          <div
            className={`font-mono text-xs ${tooLong ? "text-red-400" : "text-zinc-500"}`}
            data-testid="bio-char-count"
          >
            {t("userProfile.dossier.bioCharCount", { count: value.length })}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              {t("userProfile.dossier.bioCancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || tooLong}
              className="px-4 py-1.5 rounded-md text-xs font-semibold bg-amber-400 text-black hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              data-testid="bio-save"
            >
              {saving ? "…" : t("userProfile.dossier.bioSave")}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
