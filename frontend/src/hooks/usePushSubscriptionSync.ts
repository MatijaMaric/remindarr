import { useEffect } from "react";
import { isPushSupported, subscribeToPush, getExistingSubscription } from "../lib/push";
import * as api from "../api";

async function renewSubscription() {
  if (!isPushSupported()) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  const [{ notifiers }, existingSub] = await Promise.all([
    api.getNotifiers(),
    getExistingSubscription(),
  ]);

  const webpushNotifier = notifiers.find((n) => n.provider === "webpush");
  if (!webpushNotifier) return;

  // Re-subscribe if the notifier is disabled or the browser has no active subscription
  if (!webpushNotifier.enabled || !existingSub) {
    const { publicKey } = await api.getVapidPublicKey();
    const subscription = await subscribeToPush(publicKey);
    await api.updateNotifier(webpushNotifier.id, { config: subscription, enabled: true });
  }
}

export function usePushSubscriptionSync() {
  useEffect(() => {
    if (!isPushSupported()) return;

    // Mount-time health check — catches SW updates that happened while no tab was open
    renewSubscription().catch(() => {});

    // controllerchange fires when a new SW takes control of this tab
    const handleControllerChange = () => {
      renewSubscription().catch(() => {});
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);
}
