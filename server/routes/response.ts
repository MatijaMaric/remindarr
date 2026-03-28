import type { Context } from "hono";

/**
 * Standard success response helper. Returns the provided data as JSON.
 */
export function ok<T extends Record<string, unknown>>(c: Context, data: T) {
  return c.json(data);
}

/**
 * Standard error response helper. Always returns `{ error: message }` with the given status code.
 */
export function err(c: Context, message: string, status: 400 | 401 | 403 | 404 | 409 | 410 | 500 | 503 = 400) {
  return c.json({ error: message }, status);
}
