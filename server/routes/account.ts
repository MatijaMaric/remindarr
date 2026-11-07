import { Hono } from "hono";
import { z } from "zod";
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  getAccountExport,
  getCredentialPasswordHash,
  requestAccountDeletion,
} from "../db/repository/account-data";
import { createZip, toCsv } from "../lib/zip";
import { zValidator } from "../lib/validator";
import { err, ok } from "./response";
import { logger } from "../logger";
import type { AppEnv } from "../types";

const log = logger.child({ module: "account" });

/** Passwordless accounts must have signed in this recently to delete. */
export const FRESH_SESSION_MS = 10 * 60 * 1000;

const app = new Hono<AppEnv>();

// GET /api/account/export — zip of profile.json + one CSV per data category.
app.get("/export", async (c) => {
  const user = c.get("user")!;
  const data = await getAccountExport(user.id);
  if (!data) return err(c, "User not found", 404);

  const exportedAt = new Date().toISOString();
  const files = [
    {
      name: "profile.json",
      content: JSON.stringify(
        {
          exportedAt,
          profile: data.profile,
          notifiers: data.notifiers,
          integrations: data.integrations,
          note: "Notifier and integration credentials, passwords, passkeys and share tokens are not exported.",
        },
        null,
        2,
      ),
    },
    ...Object.entries(data.tables).map(([table, rows]) => ({
      name: `${table}.csv`,
      content: toCsv(rows),
    })),
  ];

  return new Response(createZip(files), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="remindarr-${user.username}-${exportedAt.slice(0, 10)}.zip"`,
      "Cache-Control": "no-store",
    },
  });
});

const deleteSchema = z.object({
  confirm: z.string(),
  password: z.string().optional(),
});

// POST /api/account/delete — re-authenticate, then schedule deletion.
app.post("/delete", zValidator("json", deleteSchema), async (c) => {
  const user = c.get("user")!;
  const { confirm, password } = c.req.valid("json");
  if (confirm !== user.username) {
    return err(c, "Type your username to confirm", 400);
  }

  const hash = await getCredentialPasswordHash(user.id);
  if (hash) {
    const platform = c.get("platform");
    const valid =
      !!password &&
      !!platform &&
      (await platform.verifyPassword(password, hash));
    if (!valid) return err(c, "Incorrect password", 403);
  } else {
    // No password to check (SSO/passkey-only): require a recent sign-in.
    const session = await c
      .get("auth")
      ?.api.getSession({ headers: c.req.raw.headers });
    const createdAt = session?.session.createdAt
      ? new Date(session.session.createdAt).getTime()
      : 0;
    if (Date.now() - createdAt > FRESH_SESSION_MS) {
      return err(c, "Sign in again to delete your account", 403);
    }
  }

  const now = new Date();
  await requestAccountDeletion(user.id, now);
  log.info("Account deletion requested", { userId: user.id });
  return ok(c, {
    purgeAfter: new Date(
      now.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 86_400_000,
    ).toISOString(),
  });
});

export default app;
