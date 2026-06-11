import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { withConfigGuard } from "../test-utils/config";
import { createAuth } from "./better-auth";
import { getDb } from "../db/schema";
import { CONFIG } from "../config";
import type { Platform } from "../platform/types";

const platform: Platform = {
  hashPassword: async (password: string) => {
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(password);
    return hasher.digest("hex");
  },
  verifyPassword: async (password: string, hash: string) => {
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(password);
    return hasher.digest("hex") === hash;
  },
};

describe("better-auth signup", () => {
  withConfigGuard();
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  test("sign-up via better-auth creates user", async () => {
    const db = getDb();
    const auth = createAuth(db, platform);

    // Simulate POST /api/auth/sign-up/email
    const body = JSON.stringify({
      username: "testuser",
      email: "test@example.com",
      password: "password123",
      name: "Test User",
    });

    const request = new Request(
      "http://localhost:3000/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      },
    );

    const response = await auth.handler(request);
    const data = await response.json();

    console.log("Status:", response.status);
    console.log("Response:", JSON.stringify(data, null, 2));

    expect(response.status).toBe(200);
    expect(data.user).toBeDefined();
    expect(data.user.username).toBe("testuser");
  });

  test("sign-up succeeds from Vite dev proxy origin (:5173) when BASE_URL is unset", async () => {
    // withConfigGuard() restores CONFIG after this test.
    CONFIG.BASE_URL = "";
    const auth = createAuth(getDb(), platform);
    const request = new Request(
      "http://localhost:3000/api/auth/sign-up/email",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:5173",
          "Sec-Fetch-Site": "same-origin",
        },
        body: JSON.stringify({
          username: "viteuser",
          email: "vite@example.com",
          password: "password123",
          name: "Vite User",
        }),
      },
    );
    const response = await auth.handler(request);
    expect(response.status).toBe(200);
  });
});
