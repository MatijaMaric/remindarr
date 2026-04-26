/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { StaleWhileRevalidate, NetworkFirst, NetworkOnly } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { BackgroundSyncPlugin } from "workbox-background-sync";
declare let self: ServiceWorkerGlobalScope;

// Precache all assets built by Vite
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Navigation fallback — serve index.html for all navigation requests except /api/
const navigationRoute = new NavigationRoute(
  createHandlerBoundToURL("/index.html"),
  { denylist: [/^\/api\//] }
);
registerRoute(navigationRoute);

const CACHE_PREFIXES = [
  "api-static-v",
  "api-titles-v",
  "api-tracked-v",
  "api-episodes-v",
  "api-details-v",
  "api-calendar-v",
  "api-auth-v",
];

const CURRENT_CACHES = new Set([
  `api-static-v${__APP_VERSION__}`,
  `api-titles-v${__APP_VERSION__}`,
  `api-tracked-v${__APP_VERSION__}`,
  `api-episodes-v${__APP_VERSION__}`,
  `api-details-v${__APP_VERSION__}`,
  `api-calendar-v${__APP_VERSION__}`,
  `api-auth-v${__APP_VERSION__}`,
]);

const lastFetchTime = new Map<string, number>();

// Cache static/infrequently-changing API data (providers, genres, languages)
registerRoute(
  ({ url }) =>
    url.pathname === "/api/titles/providers" ||
    url.pathname === "/api/titles/genres" ||
    url.pathname === "/api/titles/languages",
  new StaleWhileRevalidate({
    cacheName: `api-static-v${__APP_VERSION__}`,
    plugins: [
      new ExpirationPlugin({ maxAgeSeconds: 7 * 24 * 60 * 60, maxEntries: 10 }),
    ],
  })
);

// Cache title listings — show cached immediately, update in background
registerRoute(
  ({ url }) => url.pathname === "/api/titles",
  new StaleWhileRevalidate({
    cacheName: `api-titles-v${__APP_VERSION__}`,
    plugins: [
      new ExpirationPlugin({ maxAgeSeconds: 24 * 60 * 60, maxEntries: 30 }),
      {
        cacheDidUpdate: async () => {
          lastFetchTime.set(`api-titles-v${__APP_VERSION__}`, Date.now());
        },
      },
    ],
  })
);

// Tracked titles — prefer network, fall back to cache for offline browsing
registerRoute(
  ({ url }) => url.pathname === "/api/track",
  new NetworkFirst({
    cacheName: `api-tracked-v${__APP_VERSION__}`,
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxAgeSeconds: 24 * 60 * 60, maxEntries: 20 }),
    ],
  })
);

// Upcoming episodes — prefer fresh data, serve cached when offline
registerRoute(
  ({ url }) => url.pathname === "/api/episodes/upcoming",
  new NetworkFirst({
    cacheName: `api-episodes-v${__APP_VERSION__}`,
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxAgeSeconds: 24 * 60 * 60, maxEntries: 10 }),
    ],
  })
);

// Detail pages — show cached immediately, update in background (long TTL; content rarely changes)
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/details/"),
  new StaleWhileRevalidate({
    cacheName: `api-details-v${__APP_VERSION__}`,
    plugins: [
      new ExpirationPlugin({ maxAgeSeconds: 7 * 24 * 60 * 60, maxEntries: 200 }),
    ],
  })
);

// Calendar data — prefer network, fall back to cached months when offline
registerRoute(
  ({ url }) => url.pathname === "/api/calendar",
  new NetworkFirst({
    cacheName: `api-calendar-v${__APP_VERSION__}`,
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxAgeSeconds: 24 * 60 * 60, maxEntries: 12 }),
    ],
  })
);

// Current user — prefer network for up-to-date auth state, cache as fallback
registerRoute(
  ({ url }) => url.pathname === "/api/auth/me",
  new NetworkFirst({
    cacheName: `api-auth-v${__APP_VERSION__}`,
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxAgeSeconds: 60 * 60, maxEntries: 5 }),
    ],
  })
);

// Background sync for watchlist mutations made while offline
const trackSyncPlugin = new BackgroundSyncPlugin("track-queue", {
  maxRetentionTime: 24 * 60, // Retain for up to 24 hours (in minutes)
});

registerRoute(
  ({ url }) => url.pathname.startsWith("/api/track/"),
  new NetworkOnly({ plugins: [trackSyncPlugin] }),
  "POST"
);

registerRoute(
  ({ url }) => url.pathname.startsWith("/api/track/"),
  new NetworkOnly({ plugins: [trackSyncPlugin] }),
  "DELETE"
);

// Background sync for watched/unwatched mutations made while offline
const watchedSyncPlugin = new BackgroundSyncPlugin("watched-queue", {
  maxRetentionTime: 24 * 60,
});

registerRoute(
  ({ url }) => url.pathname.startsWith("/api/watched/"),
  new NetworkOnly({ plugins: [watchedSyncPlugin] }),
  "POST"
);

registerRoute(
  ({ url }) => url.pathname.startsWith("/api/watched/"),
  new NetworkOnly({ plugins: [watchedSyncPlugin] }),
  "DELETE"
);

// Message handler: pre-cache a tracked title's detail data on demand + cache age queries
self.addEventListener("message", (event) => {
  if (event.data?.type === "GET_CACHE_AGE") {
    const ts = lastFetchTime.get(event.data.cacheName as string) ?? null;
    const ageMs = ts !== null ? Date.now() - ts : null;
    event.ports[0]?.postMessage({ ageMs });
    return;
  }

  if (event.data?.type !== "PRECACHE_TITLE") return;
  const { titleId, objectType } = event.data as { titleId: string; objectType: "MOVIE" | "SHOW" };
  const path =
    objectType === "MOVIE"
      ? `/api/details/movie/${encodeURIComponent(titleId)}`
      : `/api/details/show/${encodeURIComponent(titleId)}`;
  event.waitUntil(
    caches.open(`api-details-v${__APP_VERSION__}`).then((c) => c.add(path)).catch(() => {})
  );
});

// Skip waiting so the new SW activates immediately on update
self.skipWaiting();

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(
            (k) =>
              CACHE_PREFIXES.some((p) => k.startsWith(p)) &&
              !CURRENT_CACHES.has(k)
          )
          .map((k) => caches.delete(k))
      )
    ).then(() => (self as ServiceWorkerGlobalScope).clients.claim())
  );
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
    })
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
    })().catch(() => {}) // best-effort
  );
});

// Notification click handler — open or focus the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus existing window if available
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open new window
      return self.clients.openWindow(url);
    })
  );
});
