import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import { upsertTitles, upsertEpisodes, createUser, trackTitle, watchEpisode } from "../db/repository";
import { getRawDb } from "../db/bun-db";
import upNextApp from "./up-next";
import type { AppEnv } from "../types";

let userId: string;

function makeAuthedApp() {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: userId, username: "testuser", name: null, role: null, is_admin: false });
    await next();
  });
  a.route("/up-next", upNextApp);
  return a;
}

function makeUnauthApp() {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    const u = c.get("user");
    if (!u) return c.json({ error: "Unauthorized" }, 401);
    await next();
  });
  a.route("/up-next", upNextApp);
  return a;
}

async function getEpisodeId(titleId: string, season: number, episode: number): Promise<number> {
  const db = getRawDb();
  const row = db
    .prepare("SELECT id FROM episodes WHERE title_id = ? AND season_number = ? AND episode_number = ?")
    .get(titleId, season, episode) as { id: number } | undefined;
  if (!row) throw new Error(`Episode not found: ${titleId} s${season}e${episode}`);
  return row.id;
}

const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("testuser", "hash");
});

afterAll(() => {
  teardownTestDb();
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe("GET /up-next without auth", () => {
  it("returns 401", async () => {
    const app = makeUnauthApp();
    const res = await app.request("/up-next");
    expect(res.status).toBe(401);
  });
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe("GET /up-next", () => {
  it("returns 200 with empty items when no tracked shows", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/up-next");
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[] };
    expect(body.items).toEqual([]);
  });

  it("returns in_progress item when show has been partially watched", async () => {
    await upsertTitles([makeParsedTitle({ id: "show-ip-1", objectType: "SHOW", title: "In Progress Show" })]);
    await trackTitle("show-ip-1", userId);
    await upsertEpisodes([
      { title_id: "show-ip-1", season_number: 1, episode_number: 1, name: "Ep1", overview: null, air_date: yesterday, still_path: null },
      { title_id: "show-ip-1", season_number: 1, episode_number: 2, name: "Ep2", overview: null, air_date: today, still_path: null },
    ]);
    const ep1Id = await getEpisodeId("show-ip-1", 1, 1);
    // Mark ep1 watched to make show "in progress"
    await watchEpisode(ep1Id, userId);

    const app = makeAuthedApp();
    const res = await app.request("/up-next");
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ kind: string; titleId: number; title: string }> };
    expect(body.items.length).toBeGreaterThan(0);
    const inProgress = body.items.find((i) => i.kind === "in_progress");
    expect(inProgress).toBeDefined();
    expect(inProgress!.title).toBe("In Progress Show");
  });

  it("returns newly_aired item when show has unwatched aired episodes and was never started", async () => {
    await upsertTitles([makeParsedTitle({ id: "show-new-1", objectType: "SHOW", title: "New Show" })]);
    await trackTitle("show-new-1", userId);
    await upsertEpisodes([
      { title_id: "show-new-1", season_number: 1, episode_number: 1, name: "Pilot", overview: null, air_date: yesterday, still_path: null },
    ]);

    const app = makeAuthedApp();
    const res = await app.request("/up-next");
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ kind: string; titleId: number }> };
    const newlyAired = body.items.find((i) => i.kind === "newly_aired");
    expect(newlyAired).toBeDefined();
  });

  it("does not include the same titleId twice", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "show-dup-1", objectType: "SHOW", title: "Dup Show" }),
    ]);
    await trackTitle("show-dup-1", userId);
    await upsertEpisodes([
      { title_id: "show-dup-1", season_number: 1, episode_number: 1, name: "E1", overview: null, air_date: yesterday, still_path: null },
      { title_id: "show-dup-1", season_number: 1, episode_number: 2, name: "E2", overview: null, air_date: today, still_path: null },
    ]);

    const app = makeAuthedApp();
    const res = await app.request("/up-next");
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ titleId: number }> };
    const titleIds = body.items.map((i) => i.titleId);
    const uniqueIds = [...new Set(titleIds)];
    expect(uniqueIds.length).toBe(titleIds.length);
  });

  it("respects the limit query param", async () => {
    // Create 3 shows, each with one unwatched episode
    for (let i = 1; i <= 3; i++) {
      await upsertTitles([makeParsedTitle({ id: `show-lim-${i}`, objectType: "SHOW", title: `Show ${i}` })]);
      await trackTitle(`show-lim-${i}`, userId);
      await upsertEpisodes([
        { title_id: `show-lim-${i}`, season_number: 1, episode_number: 1, name: "Ep1", overview: null, air_date: yesterday, still_path: null },
      ]);
    }

    const app = makeAuthedApp();
    const res = await app.request("/up-next?limit=2");
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[] };
    expect(body.items.length).toBeLessThanOrEqual(2);
  });

  it("in-progress shows appear before newly-aired shows", async () => {
    // Newly aired show (never watched)
    await upsertTitles([makeParsedTitle({ id: "show-new-ord", objectType: "SHOW", title: "New Show" })]);
    await trackTitle("show-new-ord", userId);
    await upsertEpisodes([
      { title_id: "show-new-ord", season_number: 1, episode_number: 1, name: "E1", overview: null, air_date: yesterday, still_path: null },
    ]);

    // In-progress show
    await upsertTitles([makeParsedTitle({ id: "show-ip-ord", objectType: "SHOW", title: "IP Show" })]);
    await trackTitle("show-ip-ord", userId);
    await upsertEpisodes([
      { title_id: "show-ip-ord", season_number: 1, episode_number: 1, name: "E1", overview: null, air_date: yesterday, still_path: null },
      { title_id: "show-ip-ord", season_number: 1, episode_number: 2, name: "E2", overview: null, air_date: today, still_path: null },
    ]);
    const ipEp1 = await getEpisodeId("show-ip-ord", 1, 1);
    await watchEpisode(ipEp1, userId);

    const app = makeAuthedApp();
    const res = await app.request("/up-next");
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ kind: string }> };

    const kinds = body.items.map((i) => i.kind);
    const inProgressIdx = kinds.indexOf("in_progress");
    const newlyAiredIdx = kinds.indexOf("newly_aired");
    if (inProgressIdx !== -1 && newlyAiredIdx !== -1) {
      expect(inProgressIdx).toBeLessThan(newlyAiredIdx);
    }
  });
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe("validation", () => {
  it("rejects limit=abc with 400", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/up-next?limit=abc");
    expect(res.status).toBe(400);
    const body = await res.json() as { issues?: unknown[] };
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects limit=0 with 400", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/up-next?limit=0");
    expect(res.status).toBe(400);
    const body = await res.json() as { issues?: unknown[] };
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects limit=51 with 400", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/up-next?limit=51");
    expect(res.status).toBe(400);
    const body = await res.json() as { issues?: unknown[] };
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("happy path: GET /up-next with no params returns 200", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/up-next");
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });
});
