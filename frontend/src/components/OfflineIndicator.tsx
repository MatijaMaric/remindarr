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
    <div className="fixed bottom-16 sm:bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-yellow-500/90 px-4 py-2 text-sm font-medium text-black shadow-lg backdrop-blur">
      <span className="h-2 w-2 rounded-full bg-black/40" />
      You're offline — showing cached content
    </div>
  );
}
