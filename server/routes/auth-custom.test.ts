import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
} from "bun:test";
import { Hono } from "hono";
import * as repository from "../db/repository";
import Sentry from "../sentry";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import authCustomApp from "./auth-custom";

describe("GET /providers", () => {
  const app = new Hono();
  app.route("/", authCustomApp);

  beforeEach(() => {
    setupTestDb();
  });

  afterAll(() => {
    teardownTestDb();
  });

  it("returns passkey: true in providers response", async () => {
    const res = await app.request("/providers");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.local).toBe(true);
    expect(body.passkey).toBe(true);
    expect(body.oidc).toBeNull();
  });

  it("returns safe defaults and captures to Sentry when D1 lookup fails", async () => {
    const oidcSpy = spyOn(repository, "isOidcConfigured").mockRejectedValueOnce(
      new Error("SQLITE_BUSY"),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const capSpy = spyOn(Sentry, "captureException").mockReturnValue(
      "evt" as any,
    );
    capSpy.mockClear();

    const res = await app.request("/providers");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ local: true, oidc: null, passkey: true });
    expect(capSpy).toHaveBeenCalledTimes(1);

    oidcSpy.mockRestore();
    capSpy.mockRestore();
  });
});
