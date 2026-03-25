import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { getDb, passkey as passkeyTable, users } from "../db/schema";
import { sql } from "drizzle-orm";
import { createAuth } from "./better-auth";
import { BunPlatform } from "../platform/bun";

describe("passkey support", () => {
  beforeEach(() => {
    setupTestDb();
  });

  afterAll(() => {
    teardownTestDb();
  });

  it("passkey table exists after migration", async () => {
    const db = getDb();
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(passkeyTable)
      .get();
    expect(result).toBeDefined();
    expect(result!.count).toBe(0);
  });

  it("passkey table has correct columns", async () => {
    const db = getDb();
    // Create a user first to satisfy FK constraint
    await db.insert(users).values({
      id: "user-1",
      username: "testuser",
      email: "test@example.com",
      emailVerified: false,
      authProvider: "local",
      isAdmin: 0,
    }).run();

    await db.insert(passkeyTable)
      .values({
        id: "pk-1",
        publicKey: "test-public-key",
        userId: "user-1",
        webauthnUserID: "webauthn-user-1",
        counter: 0,
        credentialID: "cred-1",
        name: "My Passkey",
        deviceType: "singleDevice",
        backedUp: false,
        transports: JSON.stringify(["internal"]),
      })
      .run();

    const row = await db
      .select()
      .from(passkeyTable)
      .get();

    expect(row).toBeDefined();
    expect(row!.id).toBe("pk-1");
    expect(row!.name).toBe("My Passkey");
    expect(row!.publicKey).toBe("test-public-key");
    expect(row!.webauthnUserID).toBe("webauthn-user-1");
    expect(row!.counter).toBe(0);
    expect(row!.deviceType).toBe("singleDevice");
    expect(row!.backedUp).toBe(false);
    expect(row!.credentialID).toBe("cred-1");
    expect(row!.transports).toBe(JSON.stringify(["internal"]));
  });

  it("passkey can be inserted with null webauthnUserID", async () => {
    const db = getDb();
    await db.insert(users).values({
      id: "user-2",
      username: "testuser2",
      email: "test2@example.com",
      emailVerified: false,
      authProvider: "local",
      isAdmin: 0,
    }).run();

    await db.insert(passkeyTable)
      .values({
        id: "pk-2",
        publicKey: "test-public-key-2",
        userId: "user-2",
        webauthnUserID: null,
        counter: 0,
        credentialID: "cred-2",
      })
      .run();

    const row = await db
      .select()
      .from(passkeyTable)
      .get();

    expect(row).toBeDefined();
    expect(row!.webauthnUserID).toBeNull();
  });

  it("createAuth includes passkey plugin", () => {
    const db = getDb();
    const auth = createAuth(db, new BunPlatform());
    expect(auth).toBeDefined();
    expect(auth.handler).toBeDefined();
  });
});
