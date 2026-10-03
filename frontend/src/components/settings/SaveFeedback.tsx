import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export function useSettingsSave() {
  const [status, setStatus] = useState<
    "idle" | "unsaved" | "saving" | "saved" | "failed"
  >("idle");
  const pending = useRef(false);
  const lastSave = useRef<(() => Promise<void>) | null>(null);
  async function save(operation: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    lastSave.current = operation;
    setStatus("saving");
    try {
      await operation();
      setStatus("saved");
    } catch {
      setStatus("failed");
    } finally {
      pending.current = false;
    }
  }
  return {
    status,
    save,
    markDirty: () => setStatus("unsaved"),
    retry: () => lastSave.current && save(lastSave.current),
  };
}

export function SaveFeedback({
  status,
  retry,
}: Pick<ReturnType<typeof useSettingsSave>, "status" | "retry">) {
  const { t } = useTranslation();
  return (
    <div
      role={status === "failed" ? "alert" : "status"}
      className="mt-3 text-sm text-zinc-400"
    >
      {status === "unsaved" && t("settings.unsaved")}
      {status === "saving" && t("settings.saving")}
      {status === "saved" && t("settings.saved")}
      {status === "failed" && (
        <>
          {t("settings.unsavedError")}{" "}
          <button
            type="button"
            onClick={() => void retry()}
            className="underline"
          >
            {t("common.retry")}
          </button>
        </>
      )}
    </div>
  );
}
