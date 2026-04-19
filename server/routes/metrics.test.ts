import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { resetMetrics, httpRequestsTotal, jobsTotal } from "../metrics";
import { CONFIG } from "../config";
import metricsApp, { __resetSessionsCountCache } from "./metrics";

let app: Hono;

beforeEach(() => {
  setupTestDb();
  resetMetrics();
  __resetSessionsCountCache();
  CONFIG.METRICS_TOKEN = "";
  app = new Hono();
  app.route("/metrics", metricsApp);
});

afterAll(() => {
  teardownTestDb();
});

describe("GET /metrics", () => {
  it("returns 200 with Prometheus content type", async () => {
    const res = await app.request("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(res.headers.get("Content-Type")).toContain("version=0.0.4");
  });

  it("includes all expected metric families", async () => {
    const res = await app.request("/metrics");
    const body = await res.text();

    expect(body).toContain("http_requests_total");
    expect(body).toContain("http_request_duration_seconds");
    expect(body).toContain("db_query_duration_seconds");
    expect(body).toContain("jobs_total");
    expect(body).toContain("job_duration_seconds");
    expect(body).toContain("tmdb_requests_total");
    expect(body).toContain("tmdb_request_duration_seconds");
    expect(body).toContain("active_sessions");
  });

  it("reflects incremented counters", async () => {
    httpRequestsTotal.inc({ method: "GET", route: "/api/titles", status: "200" });
    httpRequestsTotal.inc({ method: "GET", route: "/api/titles", status: "200" });

    const res = await app.request("/metrics");
    const body = await res.text();
    expect(body).toContain('http_requests_total{method="GET",route="/api/titles",status="200"} 2');
  });

  it("reflects job counters", async () => {
    jobsTotal.inc({ name: "sync-titles", status: "completed" });

    const res = await app.request("/metrics");
    const body = await res.text();
    expect(body).toContain('jobs_total{name="sync-titles",status="completed"} 1');
  });

  it("includes active sessions gauge from DB", async () => {
    // No sessions in test DB, should be 0
    const res = await app.request("/metrics");
    const body = await res.text();
    expect(body).toContain("active_sessions 0");
  });

  it("ends with a newline", async () => {
    const res = await app.request("/metrics");
    const body = await res.text();
    expect(body.endsWith("\n")).toBe(true);
  });

  describe("METRICS_TOKEN bearer guard", () => {
    it("rejects requests without a bearer token when METRICS_TOKEN is set", async () => {
      CONFIG.METRICS_TOKEN = "secret";
      try {
        const res = await app.request("/metrics");
        expect(res.status).toBe(401);
      } finally {
        CONFIG.METRICS_TOKEN = "";
      }
    });

    it("rejects requests with a wrong bearer token", async () => {
      CONFIG.METRICS_TOKEN = "secret";
      try {
        const res = await app.request("/metrics", {
          headers: { authorization: "Bearer nope" },
        });
        expect(res.status).toBe(401);
      } finally {
        CONFIG.METRICS_TOKEN = "";
      }
    });

    it("allows requests with the correct bearer token", async () => {
      CONFIG.METRICS_TOKEN = "secret";
      try {
        const res = await app.request("/metrics", {
          headers: { authorization: "Bearer secret" },
        });
        expect(res.status).toBe(200);
      } finally {
        CONFIG.METRICS_TOKEN = "";
      }
    });
  });
});
