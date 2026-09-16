import { afterAll, beforeEach, expect, test } from "bun:test";
import { Hono } from "hono";
import { createAuth } from "../auth/better-auth";
import { CONFIG } from "../config";
import { getDb } from "../db/schema";
import { getUserById, updateUserAdmin } from "../db/repository";
import { userIdSchema } from "../lib/user-id";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { withConfigGuard } from "../test-utils/config";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import type { AppEnv } from "../types";
import admin from "./admin";
import social from "./social";

withConfigGuard();
beforeEach(() => setupTestDb());
afterAll(() => teardownTestDb());

test("real Better Auth signup IDs support social and admin contracts", async () => {
  CONFIG.BASE_URL = "http://localhost:3000";
  CONFIG.BETTER_AUTH_SECRET = "synthetic-user-id-regression-secret";
  const auth = createAuth(getDb(), {
    hashPassword: async (password) => Bun.password.hash(password),
    verifyPassword: async (password, hash) =>
      Bun.password.verify(password, hash),
  });
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", auth);
    await next();
  });
  app.use("/social/*", requireAuth);
  app.use("/admin/*", requireAuth, requireAdmin);
  app.route("/social", social);
  app.route("/admin", admin);

  async function signup(username: string) {
    const res = await auth.handler(
      new Request(`${CONFIG.BASE_URL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          name: username,
          email: `${username}@example.test`,
          password: "synthetic-test-password",
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toMatch(/^[a-zA-Z0-9]+$/);
    return {
      id: body.user.id as string,
      cookie: res.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; "),
    };
  }
  const alice = await signup("aliceid");
  const bob = await signup("bobid");
  for (const method of ["POST", "DELETE"]) {
    const res = await app.request(`/social/follow/${bob.id}`, {
      method,
      headers: { Cookie: alice.cookie },
    });
    expect(res.status).toBe(200);
  }
  const denied = await app.request(`/admin/users/${bob.id}`, {
    headers: { Cookie: alice.cookie },
  });
  expect(denied.status).toBe(403);
  await updateUserAdmin(alice.id, true);
  for (const [path, method, body] of [
    [`/admin/users/${bob.id}`, "GET", undefined],
    [`/admin/users/${bob.id}/role`, "PUT", JSON.stringify({ role: "admin" })],
    [
      `/admin/users/${bob.id}/ban`,
      "PUT",
      JSON.stringify({ reason: "regression" }),
    ],
    [`/admin/users/${bob.id}/unban`, "PUT", undefined],
  ] as const) {
    const res = await app.request(path, {
      method,
      body,
      headers: { Cookie: alice.cookie, "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);
  }
  expect((await getUserById(bob.id))?.role).toBe("admin");
  const self = await app.request(`/admin/users/${alice.id}`, {
    method: "DELETE",
    headers: { Cookie: alice.cookie },
  });
  expect(self.status).toBe(400);
  const deleted = await app.request(`/admin/users/${bob.id}`, {
    method: "DELETE",
    headers: { Cookie: alice.cookie },
  });
  expect(deleted.status).toBe(200);
  expect(await getUserById(bob.id)).toBeNull();
});

test("user IDs accept legacy UUIDs and bounded opaque values, reject malformed shapes", () => {
  for (const id of [crypto.randomUUID(), "Opaque_Existing-User123"])
    expect(userIdSchema.safeParse(id).success).toBe(true);
  for (const id of [
    "",
    "a".repeat(129),
    "has space",
    "a/b",
    "<script>",
    "a\u0000b",
  ])
    expect(userIdSchema.safeParse(id).success).toBe(false);
});
