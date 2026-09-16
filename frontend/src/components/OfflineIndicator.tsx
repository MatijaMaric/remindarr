import { useState, useEffect } from "react";

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-16 sm:bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-1 rounded-xl bg-yellow-500/90 px-4 py-2.5 text-sm font-medium text-black shadow-lg backdrop-blur max-w-xs w-max"
    >
      <div>You&apos;re offline</div>
      <div className="text-xs font-normal">
        Private data needs a connection. Watchlist and episode changes are not
        saved offline; reconnect and try again.
      </div>
    </div>
  );
}
