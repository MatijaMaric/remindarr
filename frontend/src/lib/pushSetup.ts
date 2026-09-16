// A browser has one push subscription; serialize renewal and manual registration.
let pendingSetup: Promise<unknown> = Promise.resolve();

export function runPushSetup<T>(setup: () => Promise<T>): Promise<T> {
  const result = pendingSetup.then(setup, setup);
  pendingSetup = result.catch(() => {});
  return result;
}
