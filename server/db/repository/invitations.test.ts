import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { createUser } from "../repository";
import { getDb, invitations } from "../schema";
import { eq } from "drizzle-orm";
import {
  createInvitation,
  getInvitation,
  redeemInvitation,
  getUserInvitations,
  revokeInvitation,
} from "./invitations";

let userA: string;
let userB: string;

beforeEach(async () => {
  setupTestDb();
  userA = await createUser("alice", "hash");
  userB = await createUser("bob", "hash");
});

afterAll(() => {
  teardownTestDb();
});

describe("createInvitation", () => {
  it("creates an invitation with id, code, and expiry", async () => {
    const inv = await createInvitation(userA);
    expect(inv.id).toBeDefined();
    expect(inv.code).toBeDefined();
    expect(inv.expiresAt).toBeDefined();
    // Expiry should be ~7 days from now
    const expiry = new Date(inv.expiresAt);
    const now = new Date();
    const daysDiff = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeGreaterThan(6);
    expect(daysDiff).toBeLessThanOrEqual(7);
  });
});

describe("getInvitation", () => {
  it("finds an invitation by code", async () => {
    const inv = await createInvitation(userA);
    const found = await getInvitation(inv.code);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(inv.id);
    expect(found!.createdByUsername).toBe("alice");
  });

  it("returns null for unknown code", async () => {
    const found = await getInvitation("nonexistent-code");
    expect(found).toBeNull();
  });
});

describe("redeemInvitation", () => {
  it("redeems a valid invitation", async () => {
    const inv = await createInvitation(userA);
    const result = await redeemInvitation(inv.code, userB);
    expect(result).toBe(true);

    const found = await getInvitation(inv.code);
    expect(found!.usedById).toBe(userB);
    expect(found!.usedAt).not.toBeNull();
  });

  it("returns false for already used invitation", async () => {
    const inv = await createInvitation(userA);
    await redeemInvitation(inv.code, userB);

    const secondUser = await createUser("charlie", "hash");
    const result = await redeemInvitation(inv.code, secondUser);
    expect(result).toBe(false);
  });

  it("returns false for expired invitation", async () => {
    const inv = await createInvitation(userA);

    // Manually set the expiry to the past
    const db = getDb();
    await db.update(invitations)
      .set({ expiresAt: "2020-01-01T00:00:00.000Z" })
      .where(eq(invitations.id, inv.id))
      .run();

    const result = await redeemInvitation(inv.code, userB);
    expect(result).toBe(false);
  });

  it("returns false for unknown code", async () => {
    const result = await redeemInvitation("nonexistent-code", userB);
    expect(result).toBe(false);
  });
});

describe("getUserInvitations", () => {
  it("returns all invitations created by a user", async () => {
    await createInvitation(userA);
    await createInvitation(userA);

    const invs = await getUserInvitations(userA);
    expect(invs).toHaveLength(2);
  });

  it("returns empty list when no invitations", async () => {
    const invs = await getUserInvitations(userA);
    expect(invs).toHaveLength(0);
  });

  it("does not return invitations from other users", async () => {
    await createInvitation(userA);
    await createInvitation(userB);

    const invs = await getUserInvitations(userA);
    expect(invs).toHaveLength(1);
  });
});

describe("revokeInvitation", () => {
  it("deletes an invitation owned by the user", async () => {
    const inv = await createInvitation(userA);
    await revokeInvitation(inv.id, userA);

    const invs = await getUserInvitations(userA);
    expect(invs).toHaveLength(0);
  });

  it("does not delete another user's invitation", async () => {
    const inv = await createInvitation(userA);
    await revokeInvitation(inv.id, userB); // userB did not create it

    const invs = await getUserInvitations(userA);
    expect(invs).toHaveLength(1);
  });
});
