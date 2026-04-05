import { useEffect, useRef } from "react";

/**
 * Saves scroll position to sessionStorage on unmount and restores it once `ready` is true.
 * Pass `ready=false` while content is loading so the restore fires after the DOM reaches full height.
 */
export function useScrollRestoration(key: string, ready = true): void {
  const hasRestored = useRef(false);
  const storageKey = `scroll:${key}`;

  // Restore once the page is ready
  useEffect(() => {
    if (!ready || hasRestored.current) return;
    hasRestored.current = true;
    const saved = sessionStorage.getItem(storageKey);
    if (saved !== null) {
      window.scrollTo({ top: parseInt(saved, 10), behavior: "instant" });
    }
  }, [storageKey, ready]);

  // Save on unmount
  useEffect(() => {
    return () => {
      sessionStorage.setItem(storageKey, String(Math.round(window.scrollY)));
    };
  }, [storageKey]);
}
