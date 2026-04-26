import { lazy } from "react";

const LAZY_RETRY_KEY = "__lazy_retry";

export function lazyWithRetry(factory: () => Promise<{ default: React.ComponentType }>) {
  return lazy(() =>
    factory().catch((importError: unknown) => {
      const retries = parseInt(sessionStorage.getItem(LAZY_RETRY_KEY) ?? "0", 10);
      if (retries < 2) {
        sessionStorage.setItem(LAZY_RETRY_KEY, String(retries + 1));
        window.location.reload();
        return new Promise<never>(() => {});
      }
      sessionStorage.removeItem(LAZY_RETRY_KEY);
      throw importError;
    })
  );
}
