import type {} from "../../server/worker";
import fs from "node:fs";
import path from "node:path";

fs.mkdirSync(".e2e", { recursive: true });
const directory = fs.mkdtempSync(path.resolve(".e2e/identity-"));
Object.assign(process.env, {
  DB_PATH: path.join(directory, "synthetic.db"),
  PORT: "4327",
  BASE_URL: "http://localhost:4327",
  BETTER_AUTH_SECRET: "isolated-browser-regression-secret-not-for-deployment",
  TMDB_API_KEY: "synthetic-unused",
  LOG_LEVEL: "error",
  AUTH_RATE_LIMIT_PER_MINUTE: "1000",
  GLOBAL_RATE_LIMIT_PER_MINUTE: "10000",
  OIDC_ISSUER_URL: "",
  SENTRY_DSN: "",
  BACKUP_DIR: "",
});
// No external provider/notification traffic from this isolated backend.
globalThis.fetch = (async () =>
  new Response("{}", {
    status: 503,
    headers: { "Content-Type": "application/json" },
  })) as unknown as typeof fetch;
await import("../../server/index");
const { stopWorker } = await import("../../server/jobs/worker");
stopWorker();
const { getRawDb } = await import("../../server/db/bun-db");
for (const [id, title] of [
  ["movie-901", "Alice isolated title"],
  ["movie-902", "Bob isolated title"],
]) {
  getRawDb()
    .prepare(
      "INSERT INTO titles (id, object_type, title, release_year) VALUES (?, 'MOVIE', ?, 2020)",
    )
    .run(id, title);
}
