import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser } from "../db/repository";
import userSettingsApp, { DEFAULT_HOMEPAGE_LAYOUT } from "./user-settings";
import type { AppEnv } from "../types";

let userId: string;

function makeAuthedApp() {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: userId, username: "testuser", name: null, role: null, is_admin: false });
    await next();
  });
  a.route("/user/settings", userSettingsApp);
  return a;
}

function jsonHeaders() {
  return { "Content-Type": "application/json" };
}

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("testuser", "hash");
});

afterAll(() => {
  teardownTestDb();
});

describe("GET /user/settings/homepage-layout", () => {
  it("returns default layout for new user", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/homepage-layout");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.homepage_layout).toEqual(DEFAULT_HOMEPAGE_LAYOUT);
  });

  it("returns saved layout after update", async () => {
    const app = makeAuthedApp();
    const newLayout = [
      { id: "today", enabled: true },
      { id: "upcoming", enabled: false },
      { id: "unwatched", enabled: true },
      { id: "recommendations", enabled: true },
    ];
    await app.request("/user/settings/homepage-layout", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ homepage_layout: newLayout }),
    });

    const res = await app.request("/user/settings/homepage-layout");
    const body = await res.json();
    expect(body.homepage_layout[0].id).toBe("today");
    expect(body.homepage_layout[1].enabled).toBe(false);
  });
});

describe("PUT /user/settings/homepage-layout", () => {
  it("saves a valid layout", async () => {
    const app = makeAuthedApp();
    const layout = [
      { id: "recommendations", enabled: false },
      { id: "today", enabled: true },
      { id: "unwatched", enabled: true },
      { id: "upcoming", enabled: true },
    ];
    const res = await app.request("/user/settings/homepage-layout", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ homepage_layout: layout }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.homepage_layout[0].id).toBe("recommendations");
    expect(body.homepage_layout[0].enabled).toBe(false);
  });

  it("returns 400 for non-array payload", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/homepage-layout", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ homepage_layout: "invalid" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for unknown section id", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/homepage-layout", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ homepage_layout: [{ id: "unknown_section", enabled: true }] }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for duplicate section ids", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/homepage-layout", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({
        homepage_layout: [
          { id: "today", enabled: true },
          { id: "today", enabled: false },
        ],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("partial layout: missing sections are appended with defaults", async () => {
    const app = makeAuthedApp();
    // Save only 2 sections
    await app.request("/user/settings/homepage-layout", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({
        homepage_layout: [
          { id: "today", enabled: true },
          { id: "unwatched", enabled: false },
        ],
      }),
    });

    const res = await app.request("/user/settings/homepage-layout");
    const body = await res.json();
    // All 6 sections returned; the 4 missing ones are appended
    expect(body.homepage_layout).toHaveLength(6);
    expect(body.homepage_layout[0].id).toBe("today");
    expect(body.homepage_layout[1].id).toBe("unwatched");
  });
});

describe("validation", () => {
  it("returns 400 + issues array for non-array payload", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/homepage-layout", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ homepage_layout: "invalid" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 400 + issues array for unknown section id", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/homepage-layout", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ homepage_layout: [{ id: "garbage", enabled: true }] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 400 + issues array for duplicate section ids", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/homepage-layout", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({
        homepage_layout: [
          { id: "today", enabled: true },
          { id: "today", enabled: false },
        ],
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 400 + issues array when homepage_layout is missing", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/homepage-layout", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 400 + issues array when enabled is not a boolean", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/homepage-layout", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({
        homepage_layout: [{ id: "today", enabled: "yes" }],
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("accepts airing_soon section id", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/homepage-layout", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({
        homepage_layout: [{ id: "airing_soon", enabled: true }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.homepage_layout.some((s: { id: string }) => s.id === "airing_soon")).toBe(true);
  });
});

// ─── Departure alert settings ──────────────────────────────────────────────────

describe("GET /user/settings/departure-alerts", () => {
  it("returns default departure settings for new user", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/departure-alerts");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.streamingDeparturesEnabled).toBe(true);
    expect(body.departureAlertLeadDays).toBe(7);
  });
});

describe("PUT /user/settings/departure-alerts", () => {
  it("happy path: empty body returns 200", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/departure-alerts", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
  });

  it("saves streamingDeparturesEnabled and departureAlertLeadDays", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/departure-alerts", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ streamingDeparturesEnabled: false, departureAlertLeadDays: 14 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.streamingDeparturesEnabled).toBe(false);
    expect(body.departureAlertLeadDays).toBe(14);

    // GET reflects updated values
    const getRes = await app.request("/user/settings/departure-alerts");
    const getBody = await getRes.json();
    expect(getBody.streamingDeparturesEnabled).toBe(false);
    expect(getBody.departureAlertLeadDays).toBe(14);
  });

  it("can re-enable after disabling", async () => {
    const app = makeAuthedApp();
    await app.request("/user/settings/departure-alerts", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ streamingDeparturesEnabled: false }),
    });
    const res = await app.request("/user/settings/departure-alerts", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ streamingDeparturesEnabled: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.streamingDeparturesEnabled).toBe(true);
  });
});

// ─── Crowded week settings ──────────────────────────────────────────────────────

describe("GET /user/settings/crowded-weeks", () => {
  it("returns default crowded week settings for new user", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/crowded-weeks");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.crowdedWeekThreshold).toBe(5);
    expect(body.crowdedWeekBadgeEnabled).toBe(1);
  });
});

describe("PUT /user/settings/crowded-weeks", () => {
  it("happy path: smallest valid body { crowdedWeekThreshold: 3 } returns 200", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/crowded-weeks", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ crowdedWeekThreshold: 3 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.crowdedWeekThreshold).toBe(3);
  });

  it("happy path: empty body returns 200 with current settings", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/crowded-weeks", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.crowdedWeekThreshold).toBe(5);
    expect(body.crowdedWeekBadgeEnabled).toBe(1);
  });

  it("saves crowdedWeekThreshold and crowdedWeekBadgeEnabled", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/crowded-weeks", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ crowdedWeekThreshold: 10, crowdedWeekBadgeEnabled: 0 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.crowdedWeekThreshold).toBe(10);
    expect(body.crowdedWeekBadgeEnabled).toBe(0);

    // GET reflects updated values
    const getRes = await app.request("/user/settings/crowded-weeks");
    const getBody = await getRes.json();
    expect(getBody.crowdedWeekThreshold).toBe(10);
    expect(getBody.crowdedWeekBadgeEnabled).toBe(0);
  });
});

describe("validation — departure alerts", () => {
  it("returns 400 + issues for departureAlertLeadDays = 0", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/departure-alerts", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ departureAlertLeadDays: 0 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 400 + issues for departureAlertLeadDays = 31", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/departure-alerts", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ departureAlertLeadDays: 31 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 400 + issues for non-boolean streamingDeparturesEnabled", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/departure-alerts", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ streamingDeparturesEnabled: "yes" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });
});

describe("validation — crowded weeks", () => {
  it("returns 400 + issues for crowdedWeekThreshold = 0 (too low)", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/crowded-weeks", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ crowdedWeekThreshold: 0 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 400 + issues for crowdedWeekThreshold = 25 (too high)", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/crowded-weeks", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ crowdedWeekThreshold: 25 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 400 + issues for crowdedWeekBadgeEnabled = 2 (out of range)", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/crowded-weeks", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ crowdedWeekBadgeEnabled: 2 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });
});
