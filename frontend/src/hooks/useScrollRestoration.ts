import { useEffect, useRef } from "react";

/**
 * Saves scroll position to sessionStorage on unmount and restores it once `ready` is true.
 * Pass `ready=false` while content is loading so the restore fires after the DOM reaches full height.
 */
export function useScrollRestoration(
  key: string,
  ready = true,
  resetWhenMissing = false,
): void {
  const restoredKey = useRef<string | null>(null);
  const storageKey = `scroll:${key}`;

  // Restore once the page is ready
  useEffect(() => {
    if (!ready || restoredKey.current === storageKey) return;
    restoredKey.current = storageKey;
    const saved = sessionStorage.getItem(storageKey);
    if (saved !== null || resetWhenMissing) {
      window.scrollTo({
        top: saved === null ? 0 : parseInt(saved, 10),
        behavior: "instant",
      });
    }
  }, [storageKey, ready, resetWhenMissing]);

  // Capture while the page is mounted: removing a long result list can clamp
  // window.scrollY before an unmount cleanup reads it.
  useEffect(() => {
    let position = window.scrollY;
    const capture = () => {
      position = window.scrollY;
    };
    window.addEventListener("scroll", capture, { passive: true });
    return () => {
      window.removeEventListener("scroll", capture);
      sessionStorage.setItem(storageKey, String(Math.round(position)));
    };
  }, [storageKey]);
}
