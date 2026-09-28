import { describe, test, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";

/**
 * Bun (`server/index.ts`) and Cloudflare Workers (`server/worker.ts`) are
 * wired by hand and must stay in sync: a route added to one but not the
 * other silently vanishes from that deployment.
 *
 * This test extracts `app.route("/api/...")` mounts from both files and
 * asserts the sets match. Route presence does not cover middleware; write-path
 * rate limiters are checked separately below (#1307).
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

/**
 * Write-path limiters are mounted by hand in both entry points. A route that
 * exists on CF without the Bun limiter is a real throttle gap (#1307).
 *
 * Ratings and episode comments are intentionally excluded: Bun shares
 * `writeRateLimiter` with them, while CF keeps dedicated limiters.
 */
const WRITE_LIMITED_ROUTES = [
  "/api/track/*",
  "/api/track",
  "/api/watched/*",
  "/api/watched",
  "/api/imdb/*",
  "/api/imdb",
  "/api/notifiers/*",
  "/api/notifiers",
  "/api/integrations/*",
  "/api/integrations",
  "/api/import/*",
  "/api/import",
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractUseArgs(src: string, route: string): string | null {
  const re = new RegExp(
    `app\\.use\\(\\s*["'\`]${escapeRegExp(route)}["'\`]\\s*,([\\s\\S]*?)\\)`,
  );
  const match = src.match(re);
  return match ? normalize(match[1]) : null;
}

function extractLimiterConfig(src: string, name: string): string | null {
  const re = new RegExp(`const ${name} = rateLimiter\\(\\{([\\s\\S]*?)\\}\\)`);
  const match = src.match(re);
  return match ? normalize(match[1]) : null;
}

describe("Bun vs CF Workers write-path rate limiter parity", () => {
  const bunSrc = fs.readFileSync(BUN_INDEX, "utf-8");
  const cfSrc = fs.readFileSync(CF_WORKER, "utf-8");

  test("write and import limiters use the same store, scope, and budget", () => {
    for (const name of ["writeRateLimiter", "importRateLimiter"] as const) {
      const bun = extractLimiterConfig(bunSrc, name);
      const cf = extractLimiterConfig(cfSrc, name);
      expect(bun, `${name} missing from server/index.ts`).not.toBeNull();
      expect(cf, `${name} missing from server/worker.ts`).not.toBeNull();
      expect(cf).toBe(bun);
    }
  });

  test("each write-path route mounts the same limiter ahead of requireAuth", () => {
    for (const route of WRITE_LIMITED_ROUTES) {
      const bun = extractUseArgs(bunSrc, route);
      const cf = extractUseArgs(cfSrc, route);
      expect(bun, `${route} missing from server/index.ts`).not.toBeNull();
      expect(cf).toBe(bun);
      expect(cf).toMatch(/RateLimiter, requireAuth$/);
    }
  });
});
