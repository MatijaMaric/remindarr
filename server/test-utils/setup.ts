import { CONFIG } from "../config";
CONFIG.DB_PATH = ":memory:";

import { initBunDb, resetDb } from "../db/bun-db";

export function setupTestDb() {
  resetDb();
  initBunDb();
}

export function teardownTestDb() {
  resetDb();
}
