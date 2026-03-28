import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Bell, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { isPushSupported, subscribeToPush, getExistingSubscription } from "../lib/push";
import * as api from "../api";

const DISMISSED_KEY = "notification-prompt-dismissed";

export default function NotificationPrompt() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!isPushSupported()) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "default") return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    let cancelled = false;
    getExistingSubscription().then((sub) => {
      if (!cancelled && !sub) {
        setVisible(true);
      }
    });
    return () => { cancelled = true; };
  }, [user]);

  if (!visible) return null;

  async function handleEnable() {
    setEnabling(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setVisible(false);
        return;
      }

      const { publicKey } = await api.getVapidPublicKey();
      const subscription = await subscribeToPush(publicKey);

      await api.createNotifier({
        provider: "webpush",
        config: subscription,
        notify_time: "09:00",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      setVisible(false);
    } catch {
      // If enabling fails, just hide the prompt
      setVisible(false);
    } finally {
      setEnabling(false);
    }
  }

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  }

  return (
    <div
      role="banner"
      className="mb-4 flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3"
    >
      <Bell className="size-5 shrink-0 text-amber-400" aria-hidden="true" />
      <p className="flex-1 text-sm text-zinc-200">
        {t("notificationPrompt.message")}
      </p>
      <button
        onClick={handleEnable}
        disabled={enabling}
        className="shrink-0 rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-amber-400 disabled:opacity-50"
      >
        {enabling ? t("notificationPrompt.enabling") : t("notificationPrompt.enable")}
      </button>
      <button
        onClick={handleDismiss}
        className="shrink-0 text-zinc-400 transition-colors hover:text-white"
        aria-label={t("notificationPrompt.dismiss")}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
