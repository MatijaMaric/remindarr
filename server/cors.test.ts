import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { cors } from "hono/cors";

function createApp(corsOrigin: string) {
  const app = new Hono();
  if (corsOrigin) {
    const origins = corsOrigin
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    app.use(
      "/api/*",
      cors({
        origin: origins,
        credentials: true,
      }),
    );
  }
  app.get("/api/test", (c) => c.json({ ok: true }));
  return app;
}

describe("CORS configuration", () => {
  it("sends no CORS headers when CORS_ORIGIN is empty", async () => {
    const app = createApp("");
    const res = await app.request("/api/test", {
      headers: { Origin: "https://evil.example.com" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("allows a matching origin", async () => {
    const app = createApp("https://myapp.example.com");
    const res = await app.request("/api/test", {
      headers: { Origin: "https://myapp.example.com" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://myapp.example.com",
    );
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("rejects a non-matching origin", async () => {
    const app = createApp("https://myapp.example.com");
    const res = await app.request("/api/test", {
      headers: { Origin: "https://evil.example.com" },
    });
    expect(res.status).toBe(200);
    // Hono cors returns empty string for non-matching origins
    const acao = res.headers.get("Access-Control-Allow-Origin");
    expect(!acao || acao === "").toBe(true);
  });

  it("supports comma-separated multiple origins", async () => {
    const app = createApp(
      "https://app1.example.com, https://app2.example.com",
    );

    const res1 = await app.request("/api/test", {
      headers: { Origin: "https://app1.example.com" },
    });
    expect(res1.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app1.example.com",
    );

    const res2 = await app.request("/api/test", {
      headers: { Origin: "https://app2.example.com" },
    });
    expect(res2.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app2.example.com",
    );

    const res3 = await app.request("/api/test", {
      headers: { Origin: "https://other.example.com" },
    });
    const acao = res3.headers.get("Access-Control-Allow-Origin");
    expect(!acao || acao === "").toBe(true);
  });

  it("handles preflight OPTIONS requests with allowed origin", async () => {
    const app = createApp("https://myapp.example.com");
    const res = await app.request("/api/test", {
      method: "OPTIONS",
      headers: {
        Origin: "https://myapp.example.com",
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://myapp.example.com",
    );
  });
});
