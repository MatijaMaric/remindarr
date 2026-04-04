import { Hono } from "hono";
import {
  createInvitation,
  getInvitation,
  redeemInvitation,
  getUserInvitations,
  revokeInvitation,
  follow,
  getUsersByIds,
} from "../db/repository";
import type { AppEnv } from "../types";
import { logger } from "../logger";
import { ok, err } from "./response";

const log = logger.child({ module: "invitations" });

const app = new Hono<AppEnv>();

// POST / — Generate an invitation
app.post("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return err(c, "Authentication required", 401);
  }

  const invitation = await createInvitation(user.id);
  log.info("Invitation created", { userId: user.id, invitationId: invitation.id });
  return c.json({
    id: invitation.id,
    code: invitation.code,
    expires_at: invitation.expiresAt,
  }, 201);
});

// GET / — List user's invitations
app.get("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return err(c, "Authentication required", 401);
  }

  const rows = await getUserInvitations(user.id);

  // Batch-fetch all users referenced by usedById to avoid N+1 queries
  const usedByIds = [...new Set(rows.map((r) => r.usedById).filter((id): id is string => id !== null))];
  const usedByUsers = await getUsersByIds(usedByIds);

  const invitations = rows.map((row) => {
    let usedBy = null;
    if (row.usedById) {
      const usedByUser = usedByUsers.get(row.usedById);
      if (usedByUser) {
        usedBy = {
          id: usedByUser.id,
          username: usedByUser.username,
          name: usedByUser.display_name,
          image: null,
        };
      }
    }
    return {
      id: row.id,
      code: row.code,
      created_at: row.createdAt,
      expires_at: row.expiresAt,
      used_at: row.usedAt,
      used_by: usedBy,
    };
  });

  return ok(c, { invitations });
});

// POST /redeem/:code — Redeem an invitation
app.post("/redeem/:code", async (c) => {
  const user = c.get("user");
  if (!user) {
    return err(c, "Authentication required", 401);
  }

  const code = c.req.param("code");
  const invitation = await getInvitation(code);

  if (!invitation) {
    return err(c, "Invitation not found", 404);
  }

  if (invitation.createdById === user.id) {
    return err(c, "Cannot redeem your own invitation", 400);
  }

  if (invitation.usedById !== null) {
    return err(c, "Invitation has already been used", 409);
  }

  if (new Date(invitation.expiresAt) < new Date()) {
    return err(c, "Invitation has expired", 410);
  }

  const success = await redeemInvitation(code, user.id);
  if (!success) {
    return err(c, "Failed to redeem invitation", 400);
  }

  // Create mutual follows
  await follow(invitation.createdById, user.id);
  await follow(user.id, invitation.createdById);

  log.info("Invitation redeemed with mutual follow", {
    code,
    redeemerId: user.id,
    inviterId: invitation.createdById,
  });

  return ok(c, {
    success: true,
    inviter: {
      id: invitation.createdById,
      username: invitation.createdByUsername,
    },
  });
});

// DELETE /:id — Revoke an invitation
app.delete("/:id", async (c) => {
  const user = c.get("user");
  if (!user) {
    return err(c, "Authentication required", 401);
  }

  const id = c.req.param("id");
  await revokeInvitation(id, user.id);
  log.info("Invitation revoked", { invitationId: id, userId: user.id });
  return ok(c, { success: true });
});

export default app;
