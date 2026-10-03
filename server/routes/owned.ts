import { Hono } from "hono";
import { z } from "zod";
import { getTitleLabels, setOwnedFormats } from "../db/repository";
import { OWNED_FORMATS } from "../db/schema";
import type { AppEnv } from "../types";
import { ok, err } from "./response";
import { zValidator } from "../lib/validator";

const titleIdParamSchema = z.object({
  titleId: z.string().min(1).max(128),
});

const ownedBodySchema = z.object({
  formats: z.array(z.enum(OWNED_FORMATS)).max(OWNED_FORMATS.length),
});

const app = new Hono<AppEnv>();

// PUT /:titleId — Replace the user's owned formats for a title ([] = not owned)
app.put(
  "/:titleId",
  zValidator("param", titleIdParamSchema),
  zValidator("json", ownedBodySchema),
  async (c) => {
    const user = c.get("user")!;
    const { titleId } = c.req.valid("param");
    const formats = [...new Set(c.req.valid("json").formats)];

    if (!(await getTitleLabels([titleId])).has(titleId)) {
      return err(c, "Title not found", 404);
    }
    await setOwnedFormats(user.id, titleId, formats);
    return ok(c, { formats });
  },
);

export default app;
