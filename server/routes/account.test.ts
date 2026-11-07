import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import { readZip } from "../test-utils/read-zip";
import {
  createUser,
  createSession,
  getSessionWithUser,
  upsertTitles,
  trackTitle,
} from "../db/repository";
import {
  cancelAccountDeletion,
  purgeDeletedAccounts,
} from "../db/repository/account-data";
import { getDb, users } from "../db/schema";
import accountApp from "./account";
import type { AppEnv } from "../types";

const platform = {
  hashPassword: async (p: string) => `hashed:${p}`,
  verifyPassword: async (p: string, h: string) => h === `hashed:${p}`,
};

let userId: string;
let username: string;
let sessionCreatedAt: Date;

function makeApp() {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", {
      id: userId,
      username,
      name: null,
      role: "user",
      is_admin: false,
    });
    c.set("platform", platform as any);
    c.set("auth", {
      api: {
        getSession: async () => ({
          session: { createdAt: sessionCreatedAt },
          user: { id: userId },
        }),
      },
    } as any);
    await next();
  });
  a.route("/account", accountApp);
  return a;
}

function deleteRequest(body: unknown) {
  return makeApp().request("/account/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function deletionRequestedAt(id: string) {
  const row = await getDb()
    .select({ at: users.deletionRequestedAt })
    .from(users)
    .where(eq(users.id, id))
    .get();
  return row?.at ?? null;
}

beforeEach(async () => {
  setupTestDb();
  username = "alice";
  userId = await createUser(username, "hashed:secret-pass");
  sessionCreatedAt = new Date(0);
});

afterAll(() => {
  teardownTestDb();
});

describe("GET /account/export", () => {
  it("returns a zip of the user's own data without secrets", async () => {
    const title = makeParsedTitle({ id: "movie-1", title: "Heat" });
    await upsertTitles([title]);
    await trackTitle("movie-1", userId, 'rewatch, "soon"');
    const otherId = await createUser("bob", "hashed:x");
    await trackTitle("movie-1", otherId, "bob's note");

    const res = await makeApp().request("/account/export");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(res.headers.get("Content-Disposition")).toContain(
      'filename="remindarr-alice-',
    );

    const files = readZip(new Uint8Array(await res.arrayBuffer()));
    const profile = JSON.parse(files["profile.json"]);
    expect(profile.profile.username).toBe("alice");
    expect(profile.profile.passwordHash).toBeUndefined();
    expect(profile.profile.feedToken).toBeUndefined();
    expect(files["profile.json"]).not.toContain("hashed:secret-pass");

    const tracked = files["tracked.csv"];
    expect(tracked).toContain("titleName");
    expect(tracked).toContain("Heat");
    expect(tracked).toContain('"rewatch, ""soon"""');
    expect(tracked).not.toContain("bob's note");
    expect(Object.keys(files)).toContain("ratings.csv");
  });
});

describe("POST /account/delete", () => {
  describe("validation", () => {
    it("rejects a body without confirm", async () => {
      const res = await deleteRequest({});
      expect(res.status).toBe(400);
      expect((await res.json()).issues).toBeInstanceOf(Array);
    });
  });

  it("requires the username to be typed exactly", async () => {
    const res = await deleteRequest({
      confirm: "Alice",
      password: "secret-pass",
    });
    expect(res.status).toBe(400);
    expect(await deletionRequestedAt(userId)).toBeNull();
  });

  it("rejects a wrong password", async () => {
    const res = await deleteRequest({ confirm: "alice", password: "nope" });
    expect(res.status).toBe(403);
    expect(await deletionRequestedAt(userId)).toBeNull();
  });

  it("happy path — schedules deletion and revokes sessions", async () => {
    const token = await createSession(userId);
    const res = await deleteRequest({
      confirm: "alice",
      password: "secret-pass",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const purgeAfter = new Date(body.purgeAfter).getTime();
    expect(purgeAfter - Date.now()).toBeGreaterThan(29 * 86_400_000);
    expect(await deletionRequestedAt(userId)).not.toBeNull();
    expect(await getSessionWithUser(token)).toBeNull();
  });

  it("passwordless accounts need a recent sign-in", async () => {
    username = "sso";
    userId = await createUser("sso", null, "SSO", "oidc", "sub-1");

    sessionCreatedAt = new Date(Date.now() - 60 * 60_000);
    expect((await deleteRequest({ confirm: "sso" })).status).toBe(403);

    sessionCreatedAt = new Date();
    expect((await deleteRequest({ confirm: "sso" })).status).toBe(200);
  });
});

describe("deletion grace period", () => {
  it("signing in cancels a pending deletion", async () => {
    await deleteRequest({ confirm: "alice", password: "secret-pass" });
    expect(await cancelAccountDeletion(userId)).toBe(true);
    expect(await deletionRequestedAt(userId)).toBeNull();
    expect(await cancelAccountDeletion(userId)).toBe(false);
  });

  it("purges only accounts past the grace period", async () => {
    const keepId = await createUser("keep", "hashed:x");
    await deleteRequest({ confirm: "alice", password: "secret-pass" });

    expect(
      await purgeDeletedAccounts(new Date(Date.now() + 29 * 86_400_000)),
    ).toBe(0);
    expect(
      await purgeDeletedAccounts(new Date(Date.now() + 31 * 86_400_000)),
    ).toBe(1);

    const left = await getDb().select({ id: users.id }).from(users).all();
    expect(left.map((u) => u.id)).toEqual([keepId]);
  });
});
