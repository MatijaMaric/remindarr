/// <reference lib="webworker" />
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  matchPrecache,
} from "workbox-precaching";
import {
  registerRoute,
  NavigationRoute,
  setCatchHandler,
} from "workbox-routing";
import { StaleWhileRevalidate, NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { Queue } from "workbox-background-sync";
declare let self: ServiceWorkerGlobalScope;

// Precache all assets built by Vite
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Navigation: try fresh network first (ensures post-deploy HTML has current chunk hashes),
// fall back to the "pages" runtime cache when offline. /api/ and /share/watchlist/ are
// excluded — the former are API calls; the latter gets per-token OG tags injected at
// request time by the Worker and must not be served from cache.
const navigationStrategy = new NetworkFirst({
  cacheName: "pages",
  networkTimeoutSeconds: 2,
  plugins: [new ExpirationPlugin({ maxEntries: 10 })],
});
registerRoute(
  new NavigationRoute(navigationStrategy, {
    denylist: [/^\/api\//, /^\/share\/watchlist\//],
  }),
);

// When a navigation fails (offline and no pages cache hit), serve the
// precached index.html so the SPA shell still loads.
setCatchHandler(async ({ request }) => {
  if (request.destination === "document") {
    return (await matchPrecache("/index.html")) ?? Response.error();
  }
  return Response.error();
});

// Only these endpoints are independent of the signed-in account. Titles and
// details contain tracked/watched fields and must not enter a shared cache.
const publicCache = `api-static-v${__APP_VERSION__}`;
registerRoute(
  ({ url }) =>
    url.origin === self.location.origin &&
    [
      "/api/titles/providers",
      "/api/titles/genres",
      "/api/titles/languages",
    ].includes(url.pathname),
  new StaleWhileRevalidate({
    cacheName: publicCache,
    plugins: [
      new ExpirationPlugin({ maxAgeSeconds: 7 * 24 * 60 * 60, maxEntries: 10 }),
    ],
  }),
);

// No persistent private responses or deferred writes: an HttpOnly session cookie
// can change while this worker is asleep, so URL-keyed storage/replay is unsafe.
for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
  registerRoute(
    ({ url }) =>
      url.origin === self.location.origin && url.pathname.startsWith("/api/"),
    ({ request }) => fetch(request, { cache: "no-store" }),
    method,
  );
}

async function discardQueue(queue: Queue) {
  while (await queue.shiftRequest()) {
    /* Delete legacy writes without replay. */
  }
}

// Keep the legacy queue names solely to intercept old sync registrations. Even
// after all clients close, a sync event discards entries instead of sending them.
const legacyQueues = ["track-queue", "watched-queue"].map(
  (name) => new Queue(name, { onSync: ({ queue }) => discardQueue(queue) }),
);

async function clearPrivateData() {
  await Promise.all([
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("api-") && key !== publicCache)
            .map((key) => caches.delete(key)),
        ),
      ),
    ...legacyQueues.map(discardQueue),
  ]);
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  } else if (event.data?.type === "CLEAR_PAGES_CACHE") {
    event.waitUntil(caches.delete("pages"));
  } else if (event.data?.type === "CLEAR_PRIVATE_DATA") {
    event.waitUntil(
      clearPrivateData().then(() =>
        event.ports[0]?.postMessage({ cleared: true }),
      ),
    );
  }
  // Legacy PRECACHE_TITLE messages are intentionally ignored: details are private.
});

self.addEventListener("install", () => {
  void self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(clearPrivateData().then(() => self.clients.claim()));
});

// Push notification handler
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload: {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    data?: { url?: string };
  };

  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Remindarr", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || "/pwa-192x192.png",
      badge: payload.badge || "/pwa-192x192.png",
      data: payload.data,
    }),
  );
});

// Push subscription change — re-subscribe after service worker update
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const vapidRes = await fetch("/api/notifiers/vapid-public-key");
      if (!vapidRes.ok) return;
      const { publicKey } = await vapidRes.json();
      const subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
      await fetch("/api/notifiers/renew-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        }),
      });
    })().catch(() => {}), // best-effort
  );
});

// Notification click handler — open or focus the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Focus existing window if available
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Open new window
        return self.clients.openWindow(url);
      }),
  );
});
