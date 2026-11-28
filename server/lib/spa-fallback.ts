/**
 * Heuristic for the SPA fallback: does this path look like a request for a
 * static file rather than a client-side route?
 *
 * On Cloudflare, real static assets never reach the worker — Workers Assets
 * serves them platform-side and wrangler.toml sets
 * `not_found_handling = "none"` — so the worker returns 404 for non-API
 * file-like GET and HEAD requests before any D1/KV work or job drain.
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
