import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { setPublicCacheIfAnon } from "./cache-headers";

const ANON_RE = /^public, s-maxage=\d+, stale-while-revalidate=\d+$/;

function fakeUser() {
  return { id: "u1", username: "alice", name: null, role: null, is_admin: false };
}

describe("setPublicCacheIfAnon", () => {
  it("emits public cache header for anonymous requests", async () => {
    const app = new Hono<AppEnv>();
    app.get("/", (c) => {
      setPublicCacheIfAnon(c, 3600);
      return c.json({ ok: true });
    });
    const res = await app.request("/");
    expect(res.headers.get("cache-control")).toMatch(ANON_RE);
    expect(res.headers.get("cache-control")).toContain("s-maxage=3600");
    expect(res.headers.get("cache-control")).toContain("stale-while-revalidate=604800");
  });

  it("emits private no-store for authenticated requests", async () => {
    const app = new Hono<AppEnv>();
    app.get("/", (c) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      c.set("user", fakeUser() as any);
      setPublicCacheIfAnon(c, 3600);
      return c.json({ ok: true });
    });
    const res = await app.request("/");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("respects a custom stale-while-revalidate", async () => {
    const app = new Hono<AppEnv>();
    app.get("/", (c) => {
      setPublicCacheIfAnon(c, 600, 86400);
      return c.json({ ok: true });
    });
    const res = await app.request("/");
    expect(res.headers.get("cache-control")).toContain("stale-while-revalidate=86400");
  });

  it("does not bleed authed user header into subsequent anon response", async () => {
    const authedApp = new Hono<AppEnv>();
    authedApp.get("/", (c) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      c.set("user", fakeUser() as any);
      setPublicCacheIfAnon(c, 3600);
      return c.json({ ok: true });
    });

    const anonApp = new Hono<AppEnv>();
    anonApp.get("/", (c) => {
      setPublicCacheIfAnon(c, 3600);
      return c.json({ ok: true });
    });

    const authedRes = await authedApp.request("/");
    const anonRes = await anonApp.request("/");

    expect(authedRes.headers.get("cache-control")).toBe("private, no-store");
    expect(anonRes.headers.get("cache-control")).toMatch(ANON_RE);
  });
});
