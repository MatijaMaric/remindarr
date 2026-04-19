import { describe, test, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";

/**
 * Bun (`server/index.ts`) and Cloudflare Workers (`server/worker.ts`) are
 * wired by hand and must stay in sync: a route added to one but not the
 * other silently vanishes from that deployment.
 *
 * This test extracts `app.route("/api/...")` mounts from both files and
 * asserts the sets match. It does not validate middleware or HTTP methods —
 * only that every API surface exists on both runtimes.
 *
 * Known excluded routes (intentional divergence):
 *   - /api/jobs: Bun uses the in-memory queue route; CF uses jobs-cf.
 *     Both mount at /api/jobs so the externally-visible path is identical.
 *   - /metrics: Bun-only (pull-based Prometheus scrape; CF uses its own
 *     observability pipeline via wrangler.toml).
 */

const BUN_INDEX = path.resolve(import.meta.dir, "./index.ts");
const CF_WORKER = path.resolve(import.meta.dir, "./worker.ts");

// Matches either a quoted string literal or any single-line pattern after app.route(
const ROUTE_RE = /app\.route\(\s*["'`]([^"'`]+)["'`]/g;

function extractRoutes(file: string): Set<string> {
  const src = fs.readFileSync(file, "utf-8");
  const routes = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = ROUTE_RE.exec(src)) !== null) {
    routes.add(match[1]);
  }
  return routes;
}

describe("Bun vs CF Workers route parity", () => {
  test("every /api route in server/index.ts is also mounted in server/worker.ts", () => {
    const bunRoutes = extractRoutes(BUN_INDEX);
    const cfRoutes = extractRoutes(CF_WORKER);

    // /metrics is Bun-only by design.
    const bunApiRoutes = [...bunRoutes].filter((r) => r.startsWith("/api/"));
    const missingInCf = bunApiRoutes.filter((r) => !cfRoutes.has(r));

    expect(missingInCf).toEqual([]);
  });

  test("every /api route in server/worker.ts is also mounted in server/index.ts", () => {
    const bunRoutes = extractRoutes(BUN_INDEX);
    const cfRoutes = extractRoutes(CF_WORKER);

    const cfApiRoutes = [...cfRoutes].filter((r) => r.startsWith("/api/"));
    // Both Bun and CF mount /api/jobs (different handler modules); the path matches.
    const missingInBun = cfApiRoutes.filter((r) => !bunRoutes.has(r));

    expect(missingInBun).toEqual([]);
  });
});
