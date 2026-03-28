import { eq, and, sql, desc, isNull } from "drizzle-orm";
import { getDb } from "../schema";
import { invitations, users } from "../schema";
import { traceDbQuery } from "../../tracing";

export async function createInvitation(createdById: string): Promise<{ id: string; code: string; expiresAt: string }> {
  return traceDbQuery("createInvitation", async () => {
    const db = getDb();
    const id = crypto.randomUUID();
    const code = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    await db.insert(invitations)
      .values({ id, code, createdById, expiresAt })
      .run();
    return { id, code, expiresAt };
  });
}

export async function getInvitation(code: string) {
  return traceDbQuery("getInvitation", async () => {
    const db = getDb();
    return await db
      .select({
        id: invitations.id,
        code: invitations.code,
        createdById: invitations.createdById,
        createdByUsername: users.username,
        usedById: invitations.usedById,
        createdAt: invitations.createdAt,
        usedAt: invitations.usedAt,
        expiresAt: invitations.expiresAt,
      })
      .from(invitations)
      .innerJoin(users, eq(users.id, invitations.createdById))
      .where(eq(invitations.code, code))
      .get() ?? null;
  });
}

export async function redeemInvitation(code: string, usedById: string): Promise<boolean> {
  return traceDbQuery("redeemInvitation", async () => {
    const db = getDb();

    // Find the invitation
    const invitation = await db
      .select({
        id: invitations.id,
        usedById: invitations.usedById,
        expiresAt: invitations.expiresAt,
      })
      .from(invitations)
      .where(eq(invitations.code, code))
      .get();

    if (!invitation) return false;
    if (invitation.usedById !== null) return false;
    if (new Date(invitation.expiresAt) < new Date()) return false;

    await db.update(invitations)
      .set({ usedById, usedAt: sql`(datetime('now'))` })
      .where(eq(invitations.id, invitation.id))
      .run();

    return true;
  });
}

export async function getUserInvitations(userId: string) {
  return traceDbQuery("getUserInvitations", async () => {
    const db = getDb();
    return await db
      .select({
        id: invitations.id,
        code: invitations.code,
        usedById: invitations.usedById,
        createdAt: invitations.createdAt,
        usedAt: invitations.usedAt,
        expiresAt: invitations.expiresAt,
      })
      .from(invitations)
      .where(eq(invitations.createdById, userId))
      .orderBy(desc(invitations.createdAt))
      .all();
  });
}

export async function revokeInvitation(id: string, userId: string) {
  return traceDbQuery("revokeInvitation", async () => {
    const db = getDb();
    await db.delete(invitations)
      .where(and(eq(invitations.id, id), eq(invitations.createdById, userId)))
      .run();
  });
}
