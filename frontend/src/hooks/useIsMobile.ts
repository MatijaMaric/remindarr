import { useCallback, useSyncExternalStore } from "react";

const MOBILE_QUERY = "(max-width: 639px)";

// useSyncExternalStore re-reads the snapshot right after subscribing, so a
// breakpoint crossing between first render and subscription is not missed.
export function useIsMobile(query = MOBILE_QUERY): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
