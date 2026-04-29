import type { Context } from "hono";
import type { AppEnv } from "../types";

export function setPublicCacheIfAnon(
  c: Context<AppEnv>,
  sMaxAge: number,
  staleWhileRevalidate = 604800,
): void {
  if (c.get("user")) {
    c.header("Cache-Control", "private, no-store");
  } else {
    c.header(
      "Cache-Control",
      `public, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
    );
  }
}
