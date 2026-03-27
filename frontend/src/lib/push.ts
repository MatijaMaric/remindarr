export function isPushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// Indirection point so tests can swap out navigator.serviceWorker.ready
let _getRegistration = (): Promise<ServiceWorkerRegistration> =>
  navigator.serviceWorker.ready;

/** @internal test-only: override how we obtain the SW registration. */
export function _setRegistrationProvider(
  fn: () => Promise<ServiceWorkerRegistration>
): void {
  _getRegistration = fn;
}

export async function subscribeToPush(
  vapidPublicKey: string
): Promise<{ endpoint: string; p256dh: string; auth: string }> {
  const registration = await _getRegistration();

  // Force-clear any existing subscription to guarantee a fresh endpoint.
  // Without this, pushManager.subscribe() with the same applicationServerKey
  // returns the same (potentially expired) subscription.
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    try {
      await existing.unsubscribe();
    } catch {
      // Best effort — proceed to subscribe anyway
    }
  }

  const subscription = await registration.pushManager.subscribe({
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

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await _getRegistration();
  return registration.pushManager.getSubscription();
}

export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await getExistingSubscription();
  if (subscription) {
    await subscription.unsubscribe();
  }
}
