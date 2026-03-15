/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";

declare let self: ServiceWorkerGlobalScope;

// Precache all assets built by Vite
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Navigation fallback — serve index.html for all navigation requests except /api/
const navigationRoute = new NavigationRoute(
  async ({ request }) => {
    const cache = await caches.open("workbox-precache-v2");
    const cachedResponse = await cache.match("/index.html");
    return cachedResponse || fetch(request);
  },
  { denylist: [/^\/api\//] }
);
registerRoute(navigationRoute);

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
