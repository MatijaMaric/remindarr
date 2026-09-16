import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Bell, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  isPushSupported,
  subscribeToPush,
  getExistingSubscription,
} from "../lib/push";
import * as api from "../api";
import { runPushSetup } from "../lib/pushSetup";

const DISMISSED_KEY = "notification-prompt-dismissed";

export default function NotificationPrompt() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [failed, setFailed] = useState(false);
  const activeUserId = useRef<string | null>(null);
  const pendingSubscription = useRef<Awaited<
    ReturnType<typeof subscribeToPush>
  > | null>(null);

  useEffect(() => {
    activeUserId.current = user?.id ?? null;
    if (!user) return;
    if (!isPushSupported()) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "denied") return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    let cancelled = false;
    Promise.all([getExistingSubscription(), api.getNotifiers()])
      .then(([sub, { notifiers }]) => {
        if (cancelled) return;
        const json = sub?.toJSON();
        const registered =
          Notification.permission === "granted" &&
          json?.endpoint &&
          json.keys?.p256dh &&
          json.keys?.auth &&
          notifiers.some(
            (n) =>
              n.provider === "webpush" &&
              n.enabled &&
              n.config.endpoint === json.endpoint &&
              n.config.p256dh === json.keys?.p256dh &&
              n.config.auth === json.keys?.auth,
          );
        setVisible(!registered);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setVisible(true);
        }
      });
    return () => {
      cancelled = true;
      activeUserId.current = null;
    };
  }, [user]);

  if (!visible || !user || Notification.permission === "denied") return null;

  async function handleEnable() {
    if (enabling) return;
    const userId = user?.id;
    setEnabling(true);
    setFailed(false);
    try {
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (permission !== "granted") {
        setVisible(false);
        return;
      }

      await runPushSetup(async () => {
        if (activeUserId.current !== userId) return;
        const [existing, { notifiers }] = await Promise.all([
          getExistingSubscription(),
          api.getNotifiers(),
        ]);
        const json = existing?.toJSON();
        let subscription =
          json?.endpoint && json.keys?.p256dh && json.keys?.auth
            ? {
                endpoint: json.endpoint,
                p256dh: json.keys.p256dh,
                auth: json.keys.auth,
              }
            : pendingSubscription.current;
        if (!subscription) {
          const { publicKey } = await api.getVapidPublicKey();
          subscription = await subscribeToPush(publicKey);
        }
        // Keep the endpoint if a successful POST loses its response; retries reconcile it first.
        pendingSubscription.current = subscription;
        const notifier =
          notifiers.find(
            (n) =>
              n.provider === "webpush" &&
              n.config.endpoint === subscription.endpoint,
          ) ??
          notifiers.find(
            (n) =>
              n.provider === "webpush" &&
              existing != null &&
              n.config.endpoint === existing.endpoint,
          );
        if (activeUserId.current !== userId) return;
        if (notifier) {
          if (
            !notifier.enabled ||
            notifier.config.endpoint !== subscription.endpoint ||
            notifier.config.p256dh !== subscription.p256dh ||
            notifier.config.auth !== subscription.auth
          ) {
            await api.updateNotifier(notifier.id, {
              config: subscription,
              enabled: true,
            });
          }
        } else {
          await api.createNotifier({
            provider: "webpush",
            config: subscription,
            notify_time: "09:00",
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
        }
      });

      setVisible(false);
    } catch {
      setFailed(true);
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
      <div className="flex-1 text-sm text-zinc-200">
        <p>{t("notificationPrompt.message")}</p>
        {failed && (
          <p role="alert" className="mt-1 text-red-300">
            {t("notificationPrompt.error")}
          </p>
        )}
      </div>
      <button
        onClick={handleEnable}
        disabled={enabling}
        className="shrink-0 rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-amber-400 disabled:opacity-50"
      >
        {enabling
          ? t("notificationPrompt.enabling")
          : failed
            ? t("common.retry")
            : t("notificationPrompt.enable")}
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
