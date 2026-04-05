import { useState, useEffect } from "react";

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed bottom-16 sm:bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-1 rounded-xl bg-yellow-500/90 px-4 py-2.5 text-sm font-medium text-black shadow-lg backdrop-blur max-w-xs w-max">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-black/40 shrink-0" />
        You're offline
      </div>
      <ul className="text-xs font-normal opacity-75 pl-4 space-y-0.5">
        <li>Browsing, details &amp; calendar available</li>
        <li>Episode &amp; watchlist changes will sync</li>
      </ul>
    </div>
  );
}
