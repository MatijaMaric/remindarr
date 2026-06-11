import { beforeEach, afterEach } from "bun:test";
import { CONFIG } from "../config";

/** A full shallow snapshot of CONFIG, field for field. */
export type ConfigSnapshot = {
  [K in keyof typeof CONFIG]: (typeof CONFIG)[K];
};

/** Take a shallow copy of the current CONFIG. */
export function snapshotConfig(): ConfigSnapshot {
  return { ...CONFIG };
}

/** Write a previously taken snapshot back onto the live CONFIG object. */
export function restoreConfig(snapshot: ConfigSnapshot): void {
  Object.assign(CONFIG, snapshot);
}

/**
 * Register beforeEach/afterEach hooks that snapshot CONFIG before every test
 * and restore it after every test.
 *
 * Calling withConfigGuard() inside a `describe` scopes the hooks to that
 * describe block; calling it at file top level guards the whole file. The
 * point: direct CONFIG mutations can never leak across tests or files.
 */
export function withConfigGuard(): void {
  let snapshot: ConfigSnapshot;
  beforeEach(() => {
    snapshot = snapshotConfig();
  });
  afterEach(() => {
    restoreConfig(snapshot);
  });
}
