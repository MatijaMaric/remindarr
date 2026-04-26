import { useState, useEffect } from "react";

async function queryCacheAge(cacheName: string): Promise<number | null> {
  const sw = navigator.serviceWorker?.controller;
  if (!sw) return null;
  return new Promise((resolve) => {
    const mc = new MessageChannel();
    mc.port1.onmessage = (e) => resolve((e.data as { ageMs: number | null }).ageMs);
    sw.postMessage({ type: "GET_CACHE_AGE", cacheName }, [mc.port2]);
    setTimeout(() => resolve(null), 2000);
  });
}

function formatAge(ms: number): string {
  const days = Math.floor(ms / 86400000);
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(ms / 3600000);
  if (hours > 0) return `${hours}h ago`;
  return "recently";
}

const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [cacheAgeMs, setCacheAgeMs] = useState<number | null>(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setCacheAgeMs(null);
    };
    const handleOffline = () => {
      setIsOnline(false);
      void queryCacheAge(`api-titles-v${__APP_VERSION__}`).then(setCacheAgeMs);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if (!navigator.onLine) {
      void queryCacheAge(`api-titles-v${__APP_VERSION__}`).then(setCacheAgeMs);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) return null;

  const isStale = cacheAgeMs !== null && cacheAgeMs > STALE_THRESHOLD_MS;
  const bgClass = isStale
    ? "bg-orange-500/90"
    : "bg-yellow-500/90";

  return (
    <div className={`fixed bottom-16 sm:bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-1 rounded-xl ${bgClass} px-4 py-2.5 text-sm font-medium text-black shadow-lg backdrop-blur max-w-xs w-max`}>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-black/40 shrink-0" />
        You&apos;re offline
        {cacheAgeMs !== null && (
          <span className="opacity-75 font-normal">
            — last refreshed {formatAge(cacheAgeMs)}
          </span>
        )}
      </div>
      <ul className="text-xs font-normal opacity-75 pl-4 space-y-0.5">
        <li>Browsing, details &amp; calendar available</li>
        <li>Episode &amp; watchlist changes will sync</li>
      </ul>
    </div>
  );
}
