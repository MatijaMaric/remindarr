import { CONFIG } from "../config";
CONFIG.DB_PATH = ":memory:";

import {
  initBunDb,
  initBunDbFromSnapshot,
  resetDb,
  snapshotDb,
} from "../db/bun-db";

let cachedSnapshot: Uint8Array | null = null;

export function setupTestDb() {
  resetDb();
  if (cachedSnapshot) {
    initBunDbFromSnapshot(cachedSnapshot);
  } else {
    initBunDb();
    cachedSnapshot = snapshotDb();
  }
}

export function teardownTestDb() {
  resetDb();
}
