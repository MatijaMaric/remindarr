/** Thin wrapper so tests can mock navigator.serviceWorker.ready via mock.module. */
export async function getRegistration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.ready;
}
