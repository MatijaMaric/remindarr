import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { createUser } from "./users";
import {
  getWatchlistShareToken,
  setWatchlistShareToken,
  getUserByWatchlistShareToken,
} from "./users";

beforeEach(() => {
  setupTestDb();
});

afterAll(() => {
  teardownTestDb();
});

describe("Watchlist share token", () => {
  it("returns null when no token is set", async () => {
    const userId = await createUser("tokenuser1", "hash");
    const token = await getWatchlistShareToken(userId);
    expect(token).toBeNull();
  });

  it("set → get returns the token", async () => {
    const userId = await createUser("tokenuser2", "hash");
    await setWatchlistShareToken(userId, "mytoken123");
    const token = await getWatchlistShareToken(userId);
    expect(token).toBe("mytoken123");
  });

  it("getUserByWatchlistShareToken resolves correct user", async () => {
    const userId = await createUser("tokenuser3", "hash");
    await setWatchlistShareToken(userId, "findmetoken");
    const user = await getUserByWatchlistShareToken("findmetoken");
    expect(user).not.toBeNull();
    expect(user!.id).toBe(userId);
    expect(user!.username).toBe("tokenuser3");
  });

  it("getUserByWatchlistShareToken returns null for unknown token", async () => {
    const user = await getUserByWatchlistShareToken("doesnotexist");
    expect(user).toBeNull();
  });

  it("revoke (set null) → get returns null", async () => {
    const userId = await createUser("tokenuser4", "hash");
    await setWatchlistShareToken(userId, "revoketoken");
    await setWatchlistShareToken(userId, null);
    const token = await getWatchlistShareToken(userId);
    expect(token).toBeNull();
  });

  it("revoked token no longer resolves a user", async () => {
    const userId = await createUser("tokenuser5", "hash");
    await setWatchlistShareToken(userId, "revokeme");
    await setWatchlistShareToken(userId, null);
    const user = await getUserByWatchlistShareToken("revokeme");
    expect(user).toBeNull();
  });
});
