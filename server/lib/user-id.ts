import { z } from "zod";

// #1155 corrects the UUID-only validation added in #1018/#1034: Better Auth
// generates opaque IDs, while legacy registrations use UUIDs.
export const userIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
