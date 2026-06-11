/**
 * Heuristic for the SPA fallback: does this path look like a request for a
 * static file rather than a client-side route?
 *
 * On Cloudflare, real static assets never reach the worker — Workers Assets
 * serves them platform-side and wrangler.toml sets
 * `not_found_handling = "none"` — so a file-like path that reaches the SPA
 * fallback (e.g. a scanner probing /.env or /wp-login.php) is a guaranteed
 * 404. Returning 404 immediately skips the index.html asset fetch, saving a
 * KV round-trip per scanner probe. Under Bun the equivalent middleware sits
 * after the real-file serveStatic, so the same guarantee holds.
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
