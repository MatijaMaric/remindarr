import { Hono } from "hono";
import { getHomepageLayout, setHomepageLayout } from "../db/repository";
import type { AppEnv } from "../types";
import { ok } from "./response";

export const HOMEPAGE_SECTION_IDS = ["unwatched", "recommendations", "today", "upcoming"] as const;
export type HomepageSectionId = (typeof HOMEPAGE_SECTION_IDS)[number];

export interface HomepageSection {
  id: HomepageSectionId;
  enabled: boolean;
}

export const DEFAULT_HOMEPAGE_LAYOUT: HomepageSection[] = [
  { id: "unwatched", enabled: true },
  { id: "recommendations", enabled: true },
  { id: "today", enabled: true },
  { id: "upcoming", enabled: true },
];

function parseLayout(raw: string | null): HomepageSection[] {
  if (!raw) return DEFAULT_HOMEPAGE_LAYOUT;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_HOMEPAGE_LAYOUT;

    // Validate and normalise: keep only known section IDs, fill in any missing ones
    const seen = new Set<string>();
    const valid: HomepageSection[] = [];
    for (const item of parsed) {
      if (
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).id === "string" &&
        HOMEPAGE_SECTION_IDS.includes((item as Record<string, unknown>).id as HomepageSectionId) &&
        !seen.has((item as Record<string, unknown>).id as string)
      ) {
        seen.add((item as Record<string, unknown>).id as string);
        valid.push({
          id: (item as Record<string, unknown>).id as HomepageSectionId,
          enabled: (item as Record<string, unknown>).enabled !== false,
        });
      }
    }

    // Append any sections that weren't in the saved layout (new sections added later)
    for (const def of DEFAULT_HOMEPAGE_LAYOUT) {
      if (!seen.has(def.id)) {
        valid.push({ id: def.id, enabled: true });
      }
    }
    return valid.length > 0 ? valid : DEFAULT_HOMEPAGE_LAYOUT;
  } catch {
    return DEFAULT_HOMEPAGE_LAYOUT;
  }
}

const app = new Hono<AppEnv>();

app.get("/homepage-layout", async (c) => {
  const user = c.get("user")!;
  const raw = await getHomepageLayout(user.id);
  return ok(c, { homepage_layout: parseLayout(raw) });
});

app.put("/homepage-layout", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json<{ homepage_layout: unknown }>();

  if (!Array.isArray(body.homepage_layout)) {
    return c.json({ error: "homepage_layout must be an array" }, 400);
  }

  // Validate each entry
  const layout: HomepageSection[] = [];
  const seen = new Set<string>();
  for (const item of body.homepage_layout) {
    if (
      typeof item !== "object" ||
      item === null ||
      !HOMEPAGE_SECTION_IDS.includes((item as Record<string, unknown>).id as HomepageSectionId) ||
      seen.has((item as Record<string, unknown>).id as string)
    ) {
      return c.json({ error: `Invalid section entry: ${JSON.stringify(item)}` }, 400);
    }
    seen.add((item as Record<string, unknown>).id as string);
    layout.push({
      id: (item as Record<string, unknown>).id as HomepageSectionId,
      enabled: (item as Record<string, unknown>).enabled !== false,
    });
  }

  await setHomepageLayout(user.id, JSON.stringify(layout));
  return ok(c, { homepage_layout: parseLayout(JSON.stringify(layout)) });
});

export default app;
