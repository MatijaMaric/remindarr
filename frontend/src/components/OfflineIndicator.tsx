import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { pendingWatchlist } from "../lib/offline";

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(false);
  const { user, sessionStatus, refresh } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    const update = () => {
      void pendingWatchlist()
        .then((items) => setPending(items.length))
        .catch(() => {});
    };
    const failure = () => {
      setFailed(true);
      update();
    };
    const synced = () => {
      setFailed(false);
      update();
    };
    update();
    window.addEventListener("offline:changed", update);
    window.addEventListener("offline:sync-error", failure);
    window.addEventListener("offline:synced", synced);
    return () => {
      window.removeEventListener("offline:changed", update);
      window.removeEventListener("offline:sync-error", failure);
      window.removeEventListener("offline:synced", synced);
    };
  }, [user?.id]);

  if (isOnline && sessionStatus !== "offline" && !pending && !failed)
    return null;

  return (
    <div
      role="status"
      className="fixed bottom-[calc(100px+env(safe-area-inset-bottom,0px))] xl:bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-1 rounded-xl bg-yellow-500/90 px-4 py-2.5 text-sm font-medium text-black shadow-lg backdrop-blur max-w-xs w-max"
    >
      <div>
        {isOnline && sessionStatus !== "offline"
          ? t("offline.pending", { count: pending })
          : t("offline.title")}
      </div>
      <div className="text-xs font-normal">
        {sessionStatus === "offline" || user
          ? t("offline.available")
          : t("offline.unavailable")}
        {pending > 0 && <p>{t("offline.pending", { count: pending })}</p>}
        {failed && <p role="alert">{t("offline.syncError")}</p>}
        {isOnline && user && pending > 0 && (
          <button
            type="button"
            className="underline"
            onClick={() => {
              void refresh().catch(() => setFailed(true));
            }}
          >
            {t("common.retry")}
          </button>
        )}
      </div>
    </div>
  );
}
