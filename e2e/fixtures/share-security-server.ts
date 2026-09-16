// Include the application's shared runtime declarations when e2e is type-checked alone.
import type {} from "../../server/worker";
import fs from "node:fs";
import path from "node:path";

fs.mkdirSync(".e2e", { recursive: true });
const directory = fs.mkdtempSync(path.resolve(".e2e/share-security-"));
Object.assign(process.env, {
  DB_PATH: path.join(directory, "synthetic.db"),
  PORT: "3139",
  BASE_URL: "http://localhost:3139",
  BETTER_AUTH_SECRET: "isolated-share-regression-secret-not-for-deployment",
  TMDB_API_KEY: "synthetic-unused",
  LOG_LEVEL: "error",
  OIDC_ISSUER_URL: "",
  SENTRY_DSN: "",
  BACKUP_DIR: "",
});
// Mock every outbound provider request, including any startup jobs.
globalThis.fetch = Object.assign(
  async () => new Response("{}", { status: 503 }),
  { preconnect: () => {} },
);
await import("../../server/index");
const { stopWorker } = await import("../../server/jobs/worker");
stopWorker();
