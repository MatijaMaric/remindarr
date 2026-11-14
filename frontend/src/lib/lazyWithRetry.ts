import { lazy } from "react";
import { updateAllRegistrations, clearPagesCache } from "./swControl";
import { reloadPage } from "./reloadPage";

const LAZY_RETRY_KEY = "__lazy_retry";

export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading chunk \d+ failed/i.test(
    error.message,
  );
}

// WebKit (and sometimes Firefox) cancels in-flight imports as soon as a
// document navigation starts. Reloading then cancels that navigation and
// strands the user on the page they were leaving (#1399). The window expires
// because a navigation can be abandoned (a download, a 204).
// ponytail: beforeunload only. If iOS Safari turns out not to fire it, also
// listen to the Navigation API's `navigate` event.
const LEAVING_WINDOW_MS = 5000;
let leavingAt = -Infinity;
window.addEventListener("beforeunload", () => {
  leavingAt = Date.now();
});

export async function loadWithRetry(
  factory: () => Promise<{ default: React.ComponentType }>,
): Promise<{ default: React.ComponentType }> {
  try {
    const mod = await factory();
    sessionStorage.removeItem(LAZY_RETRY_KEY);
    return mod;
  } catch (importError: unknown) {
    if (!isChunkLoadError(importError)) throw importError;
    // The page is going away: keep the Suspense fallback up, do not reload.
    if (Date.now() - leavingAt < LEAVING_WINDOW_MS)
      return new Promise<never>(() => {});

    const retries = parseInt(sessionStorage.getItem(LAZY_RETRY_KEY) ?? "0", 10);
    if (retries >= 2) {
      sessionStorage.removeItem(LAZY_RETRY_KEY);
      (importError as Record<string, unknown>).isChunkLoadError = true;
      throw importError;
    }

    sessionStorage.setItem(LAZY_RETRY_KEY, String(retries + 1));

    if (retries === 0) {
      await updateAllRegistrations();
    } else {
      await clearPagesCache();
    }

    reloadPage();
    return new Promise<never>(() => {});
  }
}

export function lazyWithRetry(
  factory: () => Promise<{ default: React.ComponentType }>,
) {
  return lazy(() => loadWithRetry(factory));
}
