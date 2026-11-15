/**
 * Where to go after signing in: the path `RequireAuth` saved in the router
 * state, or `/`. Only same-site paths are accepted ("//host" and "/\host"
 * would leave the site).
 */
export function returnTo(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === "string" && /^\/(?![/\\])/.test(from) ? from : "/";
}
