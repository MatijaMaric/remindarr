import { CONFIG } from "../config";
CONFIG.DB_PATH = ":memory:";

import { initBunDb, resetDb } from "../db/bun-db";
import { initJobsSchema } from "../jobs/queue";

export function setupTestDb() {
  resetDb();
  initBunDb();
  initJobsSchema();
}

export function teardownTestDb() {
  resetDb();
}
