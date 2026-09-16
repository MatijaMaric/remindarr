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

/** Also clean up when no worker controls this tab (upgrade/first reopened tab). */
export async function clearPrivateData(): Promise<void> {
  if ("caches" in window) {
    await Promise.all(
      (await caches.keys())
        .filter(
          (key) => key.startsWith("api-") && !key.startsWith("api-static-v"),
        )
        .map((key) => caches.delete(key)),
    );
  }
  if ("indexedDB" in window) {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("workbox-background-sync");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("requests")) {
          db.close();
          resolve();
          return;
        }
        const transaction = db.transaction("requests", "readwrite");
        const cursor = transaction.objectStore("requests").openCursor();
        cursor.onsuccess = () => {
          const entry = cursor.result;
          if (!entry) return;
          if (["track-queue", "watched-queue"].includes(entry.value.queueName))
            entry.delete();
          entry.continue();
        };
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
      };
    });
  }
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      registration.active?.postMessage({ type: "CLEAR_PRIVATE_DATA" });
    }
  }
}
