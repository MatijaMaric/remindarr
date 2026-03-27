export function isPushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function subscribeToPush(
  vapidPublicKey: string,
  pushManager?: Pick<PushManager, "getSubscription" | "subscribe">
): Promise<{ endpoint: string; p256dh: string; auth: string }> {
  const pm = pushManager ?? (await navigator.serviceWorker.ready).pushManager;

  // Force-clear any existing subscription to guarantee a fresh endpoint.
  // Without this, pushManager.subscribe() with the same applicationServerKey
  // returns the same (potentially expired) subscription.
  const existing = await pm.getSubscription();
  if (existing) {
    try {
      await existing.unsubscribe();
    } catch {
      // Best effort — proceed to subscribe anyway
    }
  }

  const subscription = await pm.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidPublicKey,
  });

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Invalid push subscription");
  }

  return {
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  };
}

export async function getExistingSubscription(
  pushManager?: Pick<PushManager, "getSubscription">
): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const pm = pushManager ?? (await navigator.serviceWorker.ready).pushManager;
  return pm.getSubscription();
}

export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await getExistingSubscription();
  if (subscription) {
    await subscription.unsubscribe();
  }
}
