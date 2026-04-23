import { zValidator as baseValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";

/**
 * Standard route validator.
 *
 * Wraps `@hono/zod-validator` so that every validation failure returns a
 * uniform JSON error shape compatible with the rest of the API:
 *
 *   { error: "Validation failed", issues: ZodIssue[] }
 *
 * Usage:
 *
 *   import { zValidator } from "../lib/validator";
 *   import { z } from "zod";
 *
 *   const schema = z.object({ titleId: z.string().min(1) });
 *   app.post("/", zValidator("json", schema), async (c) => {
 *     const body = c.req.valid("json");
 *     // ...
 *   });
 *
 * Provider/business-level validation that goes beyond shape (e.g. checking
 * timezone strings, provider-specific configs) should run inside the handler
 * AFTER this validator has accepted the payload.
 */
export function zValidator<
  T extends keyof ValidationTargets,
  S extends ZodType,
>(target: T, schema: S) {
  return baseValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "Validation failed", issues: result.error.issues },
        400,
      );
    }
  });
}
