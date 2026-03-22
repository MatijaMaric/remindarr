import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { ok, err } from "./response";

describe("ok()", () => {
  it("returns 200 with the provided data", async () => {
    const app = new Hono();
    app.get("/", (c) => ok(c, { titles: [], count: 0 }));

    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ titles: [], count: 0 });
  });

  it("returns empty object when passed empty data", async () => {
    const app = new Hono();
    app.get("/", (c) => ok(c, {}));

    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
  });
});

describe("err()", () => {
  it("returns 400 with error message by default", async () => {
    const app = new Hono();
    app.get("/", (c) => err(c, "Bad request"));

    const res = await app.request("/");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Bad request" });
  });

  it("returns 404 with error message", async () => {
    const app = new Hono();
    app.get("/", (c) => err(c, "Not found", 404));

    const res = await app.request("/");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "Not found" });
  });

  it("returns 500 with error message", async () => {
    const app = new Hono();
    app.get("/", (c) => err(c, "Internal server error", 500));

    const res = await app.request("/");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Internal server error" });
  });

  it("always uses 'error' key (not 'message' or 'ok')", async () => {
    const app = new Hono();
    app.get("/", (c) => err(c, "Something went wrong", 400));

    const res = await app.request("/");
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.message).toBeUndefined();
    expect(body.ok).toBeUndefined();
    expect(body.success).toBeUndefined();
  });
});
