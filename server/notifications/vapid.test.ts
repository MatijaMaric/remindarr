import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { CONFIG } from "../config";

CONFIG.DB_PATH = ":memory:";

import { getVapidKeys, getVapidPublicKey } from "./vapid";
import { getSetting, setSetting, deleteSetting } from "../db/repository";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";

describe("vapid", () => {
  const originalPublic = CONFIG.VAPID_PUBLIC_KEY;
  const originalPrivate = CONFIG.VAPID_PRIVATE_KEY;
  const originalSubject = CONFIG.VAPID_SUBJECT;

  beforeEach(() => {
    setupTestDb();
    CONFIG.VAPID_PUBLIC_KEY = "";
    CONFIG.VAPID_PRIVATE_KEY = "";
    CONFIG.VAPID_SUBJECT = "";
  });

  afterEach(() => {
    teardownTestDb();
    CONFIG.VAPID_PUBLIC_KEY = originalPublic;
    CONFIG.VAPID_PRIVATE_KEY = originalPrivate;
    CONFIG.VAPID_SUBJECT = originalSubject;
  });

  it("uses env vars when provided", async () => {
    CONFIG.VAPID_PUBLIC_KEY = "env-public";
    CONFIG.VAPID_PRIVATE_KEY = "env-private";
    CONFIG.VAPID_SUBJECT = "mailto:test@example.com";

    const keys = await getVapidKeys();
    expect(keys.publicKey).toBe("env-public");
    expect(keys.privateKey).toBe("env-private");
    expect(keys.subject).toBe("mailto:test@example.com");
  });

  it("uses settings table when env vars not set", async () => {
    await setSetting("vapid_public_key", "db-public");
    await setSetting("vapid_private_key", "db-private");
    await setSetting("vapid_subject", "mailto:db@example.com");

    const keys = await getVapidKeys();
    expect(keys.publicKey).toBe("db-public");
    expect(keys.privateKey).toBe("db-private");
    expect(keys.subject).toBe("mailto:db@example.com");
  });

  it("auto-generates and persists keys when neither env nor DB has them", async () => {
    const keys = await getVapidKeys();
    expect(keys.publicKey).toBeTruthy();
    expect(keys.privateKey).toBeTruthy();
    expect(keys.subject).toBe("mailto:noreply@remindarr.local");

    // Check persisted
    expect(await getSetting("vapid_public_key")).toBe(keys.publicKey);
    expect(await getSetting("vapid_private_key")).toBe(keys.privateKey);
  });

  it("env vars take precedence over DB settings", async () => {
    await setSetting("vapid_public_key", "db-public");
    await setSetting("vapid_private_key", "db-private");
    CONFIG.VAPID_PUBLIC_KEY = "env-public";
    CONFIG.VAPID_PRIVATE_KEY = "env-private";

    const keys = await getVapidKeys();
    expect(keys.publicKey).toBe("env-public");
    expect(keys.privateKey).toBe("env-private");
  });

  it("getVapidPublicKey returns only the public key", async () => {
    const keys = await getVapidKeys();
    expect(await getVapidPublicKey()).toBe(keys.publicKey);
  });
});
