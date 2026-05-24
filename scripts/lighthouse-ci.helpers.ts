export const LIGHTHOUSE_PORT = 3200;
export const LIGHTHOUSE_BASE_URL = `http://localhost:${LIGHTHOUSE_PORT}`;
export const LIGHTHOUSE_DB_DIR = ".lighthouse";
export const LIGHTHOUSE_DB_PATH = `${LIGHTHOUSE_DB_DIR}/remindarr.sqlite`;
export const LIGHTHOUSE_OUTPUT_DIR = ".lighthouseci";

export const PAGE_GROUPS = {
  public: [
    `${LIGHTHOUSE_BASE_URL}/`,
    `${LIGHTHOUSE_BASE_URL}/browse`,
    `${LIGHTHOUSE_BASE_URL}/title/movie-603`,
  ],
  auth: [`${LIGHTHOUSE_BASE_URL}/settings`, `${LIGHTHOUSE_BASE_URL}/calendar`],
} as const;

export const FORM_FACTORS = ["mobile", "desktop"] as const;
export type FormFactor = (typeof FORM_FACTORS)[number];
export type PageGroup = keyof typeof PAGE_GROUPS;

/**
 * Converts an array of Set-Cookie header values into a single Cookie request header string.
 * Strips all cookie attributes (Path, Domain, Secure, HttpOnly, SameSite, Expires, Max-Age).
 */
export function buildCookieHeader(setCookieHeaders: string[]): string {
  return setCookieHeaders
    .map((h) => h.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

export async function waitForHealth(
  url: string,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // server not up yet
    }
    await new Promise<void>((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Server did not become healthy at ${url} within ${timeoutMs}ms`,
  );
}
