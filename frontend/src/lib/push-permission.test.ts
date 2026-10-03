import { afterEach, expect, it, mock } from "bun:test";
import { getExistingSubscription } from "./push";

const originals = [
  [window, "PushManager"],
  [globalThis, "Notification"],
  [window, "Notification"],
  [navigator, "serviceWorker"],
] as const;
const descriptors = originals.map(([target, key]) =>
  Object.getOwnPropertyDescriptor(target, key),
);

afterEach(() => {
  originals.forEach(([target, key], index) => {
    const descriptor = descriptors[index];
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
  });
});

it.each(["default", "denied", "granted"] as const)(
  "only queries the native push subscription with granted permission (%s)",
  async (permission) => {
    const subscription = { endpoint: "https://push.example/test" };
    const getSubscription = mock(() => Promise.resolve(subscription));
    const ready = mock(() =>
      Promise.resolve({ pushManager: { getSubscription } }),
    );
    Object.defineProperty(window, "PushManager", {
      value: class {},
      configurable: true,
    });
    for (const target of [globalThis, window]) {
      Object.defineProperty(target, "Notification", {
        value: { permission },
        configurable: true,
      });
    }
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        get ready() {
          return ready();
        },
      },
      configurable: true,
    });

    expect(await getExistingSubscription()).toBe(
      permission === "granted" ? subscription : null,
    );
    expect(ready).toHaveBeenCalledTimes(permission === "granted" ? 1 : 0);
    expect(getSubscription).toHaveBeenCalledTimes(
      permission === "granted" ? 1 : 0,
    );
  },
);
