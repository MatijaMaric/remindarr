import { CONFIG } from "../config";
CONFIG.DB_PATH = ":memory:";

import { getDb, resetDb, getRawDb } from "../db/schema";
import { initJobsSchema } from "../jobs/queue";

export function setupTestDb() {
  resetDb();
  getDb();
  initJobsSchema();
}

export function teardownTestDb() {
  resetDb();
}
