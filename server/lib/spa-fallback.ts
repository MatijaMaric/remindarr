/**
 * Heuristic for the SPA fallback: does this path look like a request for a
 * static file rather than a client-side route?
 *
 * On Cloudflare, real static assets never reach the worker — Workers Assets
 * serves them platform-side and wrangler.toml sets
 * `not_found_handling = "none"` — so the worker's default export 404s
 * non-API file-like paths before Sentry, D1/KV or the job drain (#1391).
 * Under Bun the equivalent middleware runs after the real-file serveStatic.
 *
 * Paths under /u/ and /user/ are exempt: better-auth usernames may contain
 * dots, and /user/:username plus /u/:username/... are real SPA routes (see
 * frontend/src/App.tsx).
 */
export function isFileLikePath(path: string): boolean {
  if (path.startsWith("/u/") || path.startsWith("/user/")) return false;
  const lastSegment = path.slice(path.lastIndexOf("/") + 1);
  return lastSegment.includes(".");
}

/** Non-API file-like path: the worker 404s it before any I/O (#1391). */
export function isScannerProbePath(path: string): boolean {
  return !path.startsWith("/api/") && isFileLikePath(path);
}
