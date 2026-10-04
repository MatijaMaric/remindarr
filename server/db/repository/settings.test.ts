import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { CONFIG } from "../../config";
import { withConfigGuard } from "../../test-utils/config";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { getRawDb } from "../bun-db";
import {
  deleteSetting,
  getOidcConfig,
  isOidcConfigured,
  setSetting,
} from "./settings";

function countSettingsSelects(run: () => Promise<unknown>): Promise<number> {
  const db = getRawDb();
  const original = db.prepare.bind(db);
  let count = 0;
  db.prepare = ((sql: string) => {
    if (/^\s*select\b/i.test(sql) && /from\s+"settings"/i.test(sql)) count++;
    return original(sql);
  }) as typeof db.prepare;
  return run()
    .finally(() => {
      db.prepare = original as typeof db.prepare;
    })
    .then(() => count);
}

function clearOidcEnv() {
  CONFIG.OIDC_ISSUER_URL = "";
  CONFIG.OIDC_CLIENT_ID = "";
  CONFIG.OIDC_CLIENT_SECRET = "";
  CONFIG.OIDC_REDIRECT_URI = "";
  CONFIG.OIDC_ADMIN_CLAIM = "";
  CONFIG.OIDC_ADMIN_VALUE = "";
}

describe("OIDC settings lookup", () => {
  withConfigGuard();

  beforeEach(() => {
    setupTestDb();
    clearOidcEnv();
  });

  afterEach(() => {
    teardownTestDb();
  });

  it("reads every OIDC setting once when a request resolves config twice", async () => {
    await setSetting("oidc_issuer_url", "https://db.example");
    await setSetting("oidc_client_id", "db-client");
    await setSetting("oidc_client_secret", "db-secret");
    await setSetting("oidc_redirect_uri", "https://app.example/cb");
    await setSetting("oidc_admin_claim", "groups");
    await setSetting("oidc_admin_value", "admins");

    // Same sequence as the worker's per-request OIDC resolve:
    // isOidcConfigured() then getOidcConfig().
    const selects = await countSettingsSelects(async () => {
      expect(await isOidcConfigured()).toBe(true);
      const config = await getOidcConfig();
      expect(config).toEqual({
        issuerUrl: "https://db.example",
        clientId: "db-client",
        clientSecret: "db-secret",
        redirectUri: "https://app.example/cb",
        adminClaim: "groups",
        adminValue: "admins",
      });
    });

    expect(selects).toBe(1);
  });

  it("still sees a setting written after the first read", async () => {
    await setSetting("oidc_issuer_url", "https://first.example");
    await setSetting("oidc_client_id", "client");
    await setSetting("oidc_client_secret", "secret");
    expect((await getOidcConfig()).issuerUrl).toBe("https://first.example");

    await setSetting("oidc_issuer_url", "https://second.example");
    expect((await getOidcConfig()).issuerUrl).toBe("https://second.example");

    await deleteSetting("oidc_issuer_url");
    expect((await getOidcConfig()).issuerUrl).toBe("");
  });

  it("prefers env over the cached database row", async () => {
    await setSetting("oidc_issuer_url", "https://db.example");
    expect((await getOidcConfig()).issuerUrl).toBe("https://db.example");

    CONFIG.OIDC_ISSUER_URL = "https://env.example";
    const selects = await countSettingsSelects(async () => {
      expect((await getOidcConfig()).issuerUrl).toBe("https://env.example");
    });
    expect(selects).toBe(0);
  });

  it("does not query settings when every OIDC value comes from env", async () => {
    CONFIG.OIDC_ISSUER_URL = "https://env.example";
    CONFIG.OIDC_CLIENT_ID = "env-client";
    CONFIG.OIDC_CLIENT_SECRET = "env-secret";
    CONFIG.OIDC_REDIRECT_URI = "https://env.example/cb";
    CONFIG.OIDC_ADMIN_CLAIM = "role";
    CONFIG.OIDC_ADMIN_VALUE = "admin";
    await setSetting("oidc_issuer_url", "https://db.example");

    const selects = await countSettingsSelects(async () => {
      const config = await getOidcConfig();
      expect(config.issuerUrl).toBe("https://env.example");
      expect(config.clientId).toBe("env-client");
      expect(await isOidcConfigured()).toBe(true);
    });

    expect(selects).toBe(0);
  });
});
