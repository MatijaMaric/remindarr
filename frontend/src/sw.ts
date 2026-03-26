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

// Cache static/infrequently-changing API data (providers, genres, languages)
registerRoute(
  ({ url }) =>
    url.pathname === "/api/titles/providers" ||
    url.pathname === "/api/titles/genres" ||
    url.pathname === "/api/titles/languages",
  new StaleWhileRevalidate({
    cacheName: "api-static",
    plugins: [
      new ExpirationPlugin({ maxAgeSeconds: 7 * 24 * 60 * 60, maxEntries: 10 }),
    ],
  })
);

// Cache title listings — show cached immediately, update in background
registerRoute(
  ({ url }) => url.pathname === "/api/titles",
  new StaleWhileRevalidate({
    cacheName: "api-titles",
    plugins: [
      new ExpirationPlugin({ maxAgeSeconds: 24 * 60 * 60, maxEntries: 30 }),
    ],
  })
);

// Tracked titles — prefer network, fall back to cache for offline browsing
registerRoute(
  ({ url }) => url.pathname === "/api/track",
  new NetworkFirst({
    cacheName: "api-tracked",
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
    cacheName: "api-episodes",
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxAgeSeconds: 24 * 60 * 60, maxEntries: 10 }),
    ],
  })
);

// Current user — prefer network for up-to-date auth state, cache as fallback
registerRoute(
  ({ url }) => url.pathname === "/api/auth/me",
  new NetworkFirst({
    cacheName: "api-auth",
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

// Activate immediately
self.skipWaiting();
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
