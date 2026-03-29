import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Ensures that route imports in server/worker.ts stay in sync with server/index.ts.
 *
 * When new routes are added to index.ts, they must also be added to worker.ts
 * (the Cloudflare Workers entry point) or explicitly listed as excluded.
 */

// Routes intentionally excluded from CF Workers (with reason)
const EXCLUDED_ROUTES = [
  "jobsRoutes",    // Uses Bun-only in-memory job queue
  "metricsRoutes", // Prometheus metrics not applicable to CF Workers
];

function extractRouteImports(source: string): string[] {
  const imports: string[] = [];
  const regex = /import\s+(\w+Routes)\s+from\s+["']\.\/routes\//g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    imports.push(match[1]);
  }
  return imports.sort();
}

describe("worker.ts route parity", () => {
  const root = join(import.meta.dir, "..");
  const indexSource = readFileSync(join(root, "index.ts"), "utf-8");
  const workerSource = readFileSync(join(root, "worker.ts"), "utf-8");

  const indexRoutes = extractRouteImports(indexSource);
  const workerRoutes = extractRouteImports(workerSource);

  test("all routes from index.ts are present in worker.ts or explicitly excluded", () => {
    const missingRoutes = indexRoutes.filter(
      (route) => !workerRoutes.includes(route) && !EXCLUDED_ROUTES.includes(route),
    );

    expect(missingRoutes).toEqual([]);
  });

  test("excluded routes list is up to date (no stale entries)", () => {
    const staleExclusions = EXCLUDED_ROUTES.filter(
      (route) => !indexRoutes.includes(route),
    );

    expect(staleExclusions).toEqual([]);
  });
});
