export async function updateAllRegistrations(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.update()));
  } catch {
    // best effort
  }
}

export async function clearPagesCache(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: "CLEAR_PAGES_CACHE" });
  } catch {
    // best effort
  }
}
