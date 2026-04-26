import { describe, it, expect, spyOn } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "./validator";

const schema = z.object({ name: z.string().min(1) });

function makeApp() {
  const app = new Hono();
  app.post("/test", zValidator("json", schema), (c) => {
    return c.json({ ok: true });
  });
  return app;
}

describe("zValidator", () => {
  it("passes valid payload through", async () => {
    const app = makeApp();
    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "hello" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 400 with issues array on invalid payload", async () => {
    const app = makeApp();
    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("emits a structured warn log on validation failure", async () => {
    const errSpy = spyOn(console, "error");
    const app = makeApp();
    await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: 42 }),
    });
    expect(errSpy).toHaveBeenCalledTimes(1);
    const rawLine = errSpy.mock.calls[0][0] as string;
    const entry = JSON.parse(rawLine);
    expect(entry.msg).toBe("Request validation failed");
    expect(entry.level).toBe("warn");
    expect(entry.path).toBe("/test");
    expect(entry.method).toBe("POST");
    expect(entry.target).toBe("json");
    expect(Array.isArray(entry.issues)).toBe(true);
    errSpy.mockRestore();
  });

  it("does NOT log on successful validation", async () => {
    const errSpy = spyOn(console, "error");
    const app = makeApp();
    await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "valid" }),
    });
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
