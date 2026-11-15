import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import {
  createUser,
  createSession,
  getSessionWithUser,
  upsertTitles,
  trackTitle,
  upsertEpisodes,
  getUnwatchedEpisodes,
  watchEpisode,
} from "../db/repository";
import { makeParsedTitle } from "../test-utils/fixtures";
import { requireAuth } from "../middleware/auth";
import kioskApp from "./kiosk";
import type { AppEnv } from "../types";

function createMockAuth() {
  return {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const cookieHeader = headers.get("cookie") || "";
        const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
        const token = match?.[1];
        if (!token) return null;
        const user = await getSessionWithUser(token);
        if (!user) return null;
        return {
          session: { id: "session-id", userId: user.id },
          user: {
            id: user.id,
            name: user.display_name,
            username: user.username,
            role: user.role || (user.is_admin ? "admin" : "user"),
          },
        };
      },
    },
  };
}

let app: Hono<AppEnv>;
let userToken: string;
let userId: string;

beforeEach(async () => {
  setupTestDb();

  userId = await createUser("kioskuser", "hash");
  userToken = await createSession(userId);

  app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", createMockAuth() as any);
    await next();
  });
  app.use("/kiosk/token*", requireAuth);
  app.route("/kiosk", kioskApp);
});

afterAll(() => {
  teardownTestDb();
});

function authHeaders() {
  return { Cookie: `better-auth.session_token=${userToken}` };
}

describe("GET /kiosk/:token (public dashboard)", () => {
  it("returns 401 for unknown token", async () => {
    const res = await app.request("/kiosk/not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("returns dashboard data with new shape for valid token", async () => {
    const regenRes = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = (await regenRes.json()) as { token: string };

    const res = await app.request(`/kiosk/${token}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.meta).toBeDefined();
    expect(typeof body.meta.household).toBe("string");
    expect(typeof body.meta.fidelity).toBe("string");
    expect(typeof body.meta.refresh_interval_seconds).toBe("number");
    expect(typeof body.meta.generated_at).toBe("string");
    expect(Array.isArray(body.releasing_today)).toBe(true);
    expect(Array.isArray(body.unwatched_queue)).toBe(true);
    expect(body.queue_total).toBe(0);
    // The hero is picked client-side from the lists; no separate slot.
    expect("airing_now" in body).toBe(false);
  });

  it("lists each show once and keeps the most-recently-watched queue order", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const oldDay = "2001-01-01";
    await upsertTitles([
      makeParsedTitle({
        id: "tv-today",
        objectType: "SHOW",
        title: "Today Show",
      }),
      makeParsedTitle({
        id: "tv-old",
        objectType: "SHOW",
        title: "Ancient Show",
      }),
      makeParsedTitle({
        id: "tv-recent",
        objectType: "SHOW",
        title: "Recent Show",
      }),
    ]);
    for (const id of ["tv-today", "tv-old", "tv-recent"]) {
      await trackTitle(id, userId);
    }
    const ep = (
      title_id: string,
      season: number,
      n: number,
      air_date: string,
    ) => ({
      title_id,
      season_number: season,
      episode_number: n,
      name: `${title_id} ${n}`,
      overview: null,
      air_date,
      still_path: null,
    });
    await upsertEpisodes([
      // Today Show: an unwatched backlog episode plus a new one today
      ep("tv-today", 1, 1, oldDay),
      ep("tv-today", 1, 2, today),
      // Ancient Show: never watched, oldest air date
      ep("tv-old", 1, 1, oldDay),
      // Recent Show: watched E1, E2 unwatched with a newer air date
      ep("tv-recent", 1, 1, "2020-01-01"),
      ep("tv-recent", 1, 2, "2020-01-08"),
    ]);
    const unwatched = await getUnwatchedEpisodes(userId);
    const recentE1 = unwatched.find(
      (e) => e.title_id === "tv-recent" && e.episode_number === 1,
    )!;
    await watchEpisode(recentE1.id, userId);

    const regenRes = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = (await regenRes.json()) as { token: string };
    const res = await app.request(`/kiosk/${token}`, {
      headers: { "X-Timezone": "UTC" },
    });
    const body = (await res.json()) as any;

    expect(body.releasing_today.map((r: any) => r.title_id)).toEqual([
      "tv-today",
    ]);
    expect(body.releasing_today[0].kind).toBe("episode");
    expect(body.releasing_today[0].is_watched).toBe(false);
    // Today Show is in releasing_today, so it is not repeated in the queue;
    // the show you watched most recently comes first, not the oldest air date.
    expect(body.unwatched_queue.map((q: any) => q.title_id)).toEqual([
      "tv-recent",
      "tv-old",
    ]);
    expect(body.queue_total).toBe(2);
  });

  it("tags S1E1 as a premiere", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await upsertTitles([
      makeParsedTitle({ id: "tv-new", objectType: "SHOW", title: "New Show" }),
    ]);
    await trackTitle("tv-new", userId);
    await upsertEpisodes([
      {
        title_id: "tv-new",
        season_number: 1,
        episode_number: 1,
        name: "Pilot",
        overview: null,
        air_date: today,
        still_path: null,
      },
    ]);
    const regenRes = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = (await regenRes.json()) as { token: string };
    const res = await app.request(`/kiosk/${token}`, {
      headers: { "X-Timezone": "UTC" },
    });
    const body = (await res.json()) as any;
    expect(body.releasing_today[0].kind).toBe("premiere");
  });

  it("caps the queue at 8 rows but reports the full show count", async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `tv-q${i}`);
    await upsertTitles(
      ids.map((id) => makeParsedTitle({ id, objectType: "SHOW", title: id })),
    );
    for (const id of ids) await trackTitle(id, userId);
    await upsertEpisodes(
      ids.map((title_id) => ({
        title_id,
        season_number: 1,
        episode_number: 1,
        name: null,
        overview: null,
        air_date: "2020-01-01",
        still_path: null,
      })),
    );
    const regenRes = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = (await regenRes.json()) as { token: string };
    const res = await app.request(`/kiosk/${token}`);
    const body = (await res.json()) as any;
    expect(body.unwatched_queue).toHaveLength(8);
    expect(body.queue_total).toBe(10);
  });

  it("sets Cache-Control: no-cache, no-store", async () => {
    const regenRes = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = (await regenRes.json()) as { token: string };

    const res = await app.request(`/kiosk/${token}`);
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-store");
  });

  it("returns 300 refresh_interval_seconds for rich fidelity", async () => {
    const regenRes = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = (await regenRes.json()) as { token: string };

    const res = await app.request(`/kiosk/${token}?display=rich`);
    const body = (await res.json()) as any;
    expect(body.meta.refresh_interval_seconds).toBe(300);
    expect(body.meta.fidelity).toBe("rich");
  });

  it("returns 1800 refresh_interval_seconds for epaper fidelity", async () => {
    const regenRes = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = (await regenRes.json()) as { token: string };

    const res = await app.request(`/kiosk/${token}?display=epaper`);
    const body = (await res.json()) as any;
    expect(body.meta.refresh_interval_seconds).toBe(1800);
    expect(body.meta.fidelity).toBe("epaper");
  });

  it("returns 300 refresh_interval_seconds for lite fidelity", async () => {
    const regenRes = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = (await regenRes.json()) as { token: string };

    const res = await app.request(`/kiosk/${token}?display=lite`);
    const body = (await res.json()) as any;
    expect(body.meta.refresh_interval_seconds).toBe(300);
    expect(body.meta.fidelity).toBe("lite");
  });

  it("returns 400 for invalid display query param", async () => {
    const regenRes = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = (await regenRes.json()) as { token: string };

    const res = await app.request(`/kiosk/${token}?display=invalid`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 400 for token longer than 64 chars", async () => {
    const res = await app.request(`/kiosk/${"x".repeat(65)}`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("defaults to rich fidelity when display param is absent", async () => {
    const regenRes = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = (await regenRes.json()) as { token: string };

    const res = await app.request(`/kiosk/${token}`);
    const body = (await res.json()) as any;
    expect(body.meta.fidelity).toBe("rich");
    expect(body.meta.refresh_interval_seconds).toBe(300);
  });
});

describe("validation", () => {
  it("returns 400 with issues array for invalid display param", async () => {
    const regenRes = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = (await regenRes.json()) as { token: string };

    const res = await app.request(`/kiosk/${token}?display=hd`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });
});

describe("GET /api/kiosk/token (auth)", () => {
  it("returns 401 without session", async () => {
    const res = await app.request("/kiosk/token");
    expect(res.status).toBe(401);
  });

  it("returns { token: null } before any token is generated", async () => {
    const res = await app.request("/kiosk/token", { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.token).toBeNull();
  });
});

describe("POST /api/kiosk/token/regenerate (auth)", () => {
  it("returns a new token", async () => {
    const res = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(0);
  });

  it("a second regenerate invalidates the first token", async () => {
    const res1 = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token: t1 } = (await res1.json()) as { token: string };

    await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });

    const dashRes = await app.request(`/kiosk/${t1}`);
    expect(dashRes.status).toBe(401);
  });
});

describe("DELETE /api/kiosk/token (auth)", () => {
  it("returns 401 without session", async () => {
    const res = await app.request("/kiosk/token", { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  it("revokes the token — subsequent dashboard requests return 401", async () => {
    const regenRes = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = (await regenRes.json()) as { token: string };

    await app.request("/kiosk/token", {
      method: "DELETE",
      headers: authHeaders(),
    });

    const dashRes = await app.request(`/kiosk/${token}`);
    expect(dashRes.status).toBe(401);
  });

  it("returns 204", async () => {
    const res = await app.request("/kiosk/token", {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(204);
  });
});
