import { Hono } from "hono";
import { z } from "zod";
import { getHomepageLayout, setHomepageLayout } from "../db/repository";
import type { AppEnv } from "../types";
import { ok } from "./response";
import { zValidator } from "../lib/validator";

export const HOMEPAGE_SECTION_IDS = ["unwatched", "recommendations", "today", "upcoming", "airing_soon"] as const;
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
  { id: "airing_soon", enabled: false },
];

// Discriminated union: each known section id is its own member with a fixed
// `id` literal. This gives precise TypeScript narrowing and rejects unknown
// section ids at the validator boundary instead of inside the handler.
const homepageSectionSchema = z.discriminatedUnion("id", [
  z.object({ id: z.literal("unwatched"), enabled: z.boolean().default(true) }),
  z.object({ id: z.literal("recommendations"), enabled: z.boolean().default(true) }),
  z.object({ id: z.literal("today"), enabled: z.boolean().default(true) }),
  z.object({ id: z.literal("upcoming"), enabled: z.boolean().default(true) }),
  z.object({ id: z.literal("airing_soon"), enabled: z.boolean().default(false) }),
]);

const updateHomepageLayoutSchema = z.object({
  homepage_layout: z
    .array(homepageSectionSchema)
    .superRefine((sections, ctx) => {
      const seen = new Set<string>();
      for (let i = 0; i < sections.length; i++) {
        const id = sections[i].id;
        if (seen.has(id)) {
          ctx.addIssue({
            code: "custom",
            message: `Duplicate section id: ${id}`,
            path: [i, "id"],
          });
        }
        seen.add(id);
      }
    }),
});

function parseLayout(raw: string | null): HomepageSection[] {
  if (!raw) return DEFAULT_HOMEPAGE_LAYOUT;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_HOMEPAGE_LAYOUT;

    // Validate stored layout via the same zod schema. Stored data may have been
    // written by older code, so we tolerate unknown / duplicate entries by
    // dropping them rather than failing.
    const seen = new Set<string>();
    const valid: HomepageSection[] = [];
    for (const item of parsed) {
      const result = homepageSectionSchema.safeParse(item);
      if (!result.success) continue;
      const section = result.data;
      if (seen.has(section.id)) continue;
      seen.add(section.id);
      valid.push({ id: section.id, enabled: section.enabled });
    }

    // Append any sections that weren't in the saved layout (new sections added later)
    for (const def of DEFAULT_HOMEPAGE_LAYOUT) {
      if (!seen.has(def.id)) {
        valid.push({ id: def.id, enabled: def.enabled });
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

app.put(
  "/homepage-layout",
  zValidator("json", updateHomepageLayoutSchema),
  async (c) => {
    const user = c.get("user")!;
    const { homepage_layout } = c.req.valid("json");

    // Defaults from zod ensure `enabled` is present; cast through the typed
    // section shape for storage.
    const layout: HomepageSection[] = homepage_layout.map((s) => ({
      id: s.id,
      enabled: s.enabled,
    }));

    await setHomepageLayout(user.id, JSON.stringify(layout));
    return ok(c, { homepage_layout: parseLayout(JSON.stringify(layout)) });
  },
);

export default app;
