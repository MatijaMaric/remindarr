import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import {
  upsertTitles,
  upsertEpisodes,
  createUser,
  createSession,
  getSessionWithUser,
  trackTitle,
  watchTitle,
  watchEpisode,
  rateTitle,
  rateEpisode,
  createRecommendation,
  updateProfilePublic,
  follow,
} from "../db/repository";
import { optionalAuth } from "../middleware/auth";
import { getDb, episodes, ratings, episodeRatings, watchedTitles, watchedEpisodes, tracked, recommendations } from "../db/schema";
import { eq, and } from "drizzle-orm";
import profileApp from "./profile";
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
let userId: string;
let userToken: string;

beforeEach(async () => {
  setupTestDb();

  userId = await createUser("activeuser", "hash", "Active User");
  userToken = await createSession(userId);
  await updateProfilePublic(userId, "public");

  app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", createMockAuth() as any);
    await next();
  });
  app.use("/user/*", optionalAuth);
  app.route("/user", profileApp);
});

afterAll(() => {
  teardownTestDb();
});

function authHeaders(token = userToken) {
  return { Cookie: `better-auth.session_token=${token}` };
}

/** Force a specific timestamp on the most recent row for a given table. */
async function backdate(table: "ratings" | "episode_ratings" | "watched_titles" | "watched_episodes" | "tracked" | "recommendations", filter: any, ts: string) {
  const db = getDb();
  if (table === "ratings") {
    await db.update(ratings).set({ createdAt: ts }).where(filter).run();
  } else if (table === "episode_ratings") {
    await db.update(episodeRatings).set({ createdAt: ts }).where(filter).run();
  } else if (table === "watched_titles") {
    await db.update(watchedTitles).set({ watchedAt: ts }).where(filter).run();
  } else if (table === "watched_episodes") {
    await db.update(watchedEpisodes).set({ watchedAt: ts }).where(filter).run();
  } else if (table === "tracked") {
    await db.update(tracked).set({ trackedAt: ts }).where(filter).run();
  } else if (table === "recommendations") {
    await db.update(recommendations).set({ createdAt: ts }).where(filter).run();
  }
}

describe("GET /user/:username/activity", () => {
  it("returns 404 for nonexistent user", async () => {
    const res = await app.request("/user/nobody/activity");
    expect(res.status).toBe(404);
  });

  it("returns empty list for new user", async () => {
    const res = await app.request("/user/activeuser/activity");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activities).toEqual([]);
    expect(body.has_more).toBe(false);
    expect(body.next_cursor).toBeNull();
  });

  it("includes title rating events", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-1", title: "Halcyon Drift" })]);
    await rateTitle(userId, "movie-1", "LOVE");

    const res = await app.request("/user/activeuser/activity");
    const body = await res.json();
    expect(body.activities).toHaveLength(1);
    expect(body.activities[0].type).toBe("rating_title");
    expect(body.activities[0].rating).toBe("LOVE");
    expect(body.activities[0].title.id).toBe("movie-1");
    expect(body.activities[0].title.title).toBe("Halcyon Drift");
  });

  it("includes episode rating events with review", async () => {
    await upsertTitles([makeParsedTitle({ id: "show-1", objectType: "SHOW", title: "Lanternside" })]);
    await upsertEpisodes([
      { title_id: "show-1", season_number: 2, episode_number: 3, name: "The Lantern Ghost", overview: null, air_date: "2026-01-01", still_path: null },
    ]);
    const db = getDb();
    const ep = await db.select().from(episodes).where(eq(episodes.titleId, "show-1")).get();
    await rateEpisode(userId, ep!.id, "LOVE", "Best episode of the season.");

    const res = await app.request("/user/activeuser/activity");
    const body = await res.json();
    expect(body.activities).toHaveLength(1);
    expect(body.activities[0].type).toBe("rating_episode");
    expect(body.activities[0].rating).toBe("LOVE");
    expect(body.activities[0].review).toBe("Best episode of the season.");
    expect(body.activities[0].episode.season_number).toBe(2);
    expect(body.activities[0].episode.episode_number).toBe(3);
    expect(body.activities[0].episode.name).toBe("The Lantern Ghost");
  });

  it("includes watched title and watched episode events", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", title: "Tidewater" }),
      makeParsedTitle({ id: "show-1", objectType: "SHOW", title: "Small Clocks" }),
    ]);
    await upsertEpisodes([
      { title_id: "show-1", season_number: 1, episode_number: 5, name: "Brittle", overview: null, air_date: "2026-02-01", still_path: null },
    ]);
    await watchTitle("movie-1", userId);
    const db = getDb();
    const ep = await db.select().from(episodes).where(eq(episodes.titleId, "show-1")).get();
    await watchEpisode(ep!.id, userId);

    const res = await app.request("/user/activeuser/activity");
    const body = await res.json();
    const types = body.activities.map((a: any) => a.type).sort();
    expect(types).toEqual(["watched_episode", "watched_title"]);
  });

  it("includes tracked events for public-tracked titles only", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-public", title: "Public Movie" }),
      makeParsedTitle({ id: "movie-private", title: "Private Movie" }),
    ]);
    await trackTitle("movie-public", userId);
    await trackTitle("movie-private", userId);
    const db = getDb();
    await db.update(tracked).set({ public: 0 }).where(and(eq(tracked.titleId, "movie-private"), eq(tracked.userId, userId))).run();

    const res = await app.request("/user/activeuser/activity");
    const body = await res.json();
    const trackEvents = body.activities.filter((a: any) => a.type === "tracked");
    expect(trackEvents).toHaveLength(1);
    expect(trackEvents[0].title.id).toBe("movie-public");
  });

  it("includes recommendation events with message", async () => {
    await upsertTitles([makeParsedTitle({ id: "show-1", objectType: "SHOW", title: "North Water" })]);
    await createRecommendation(userId, "show-1", "The Lighthouse arc is the strongest thing on TV right now.");

    const res = await app.request("/user/activeuser/activity");
    const body = await res.json();
    const recs = body.activities.filter((a: any) => a.type === "recommendation");
    expect(recs).toHaveLength(1);
    expect(recs[0].message).toBe("The Lighthouse arc is the strongest thing on TV right now.");
    expect(recs[0].title.id).toBe("show-1");
  });

  it("orders events by created_at descending across sources", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "m1", title: "Old" }),
      makeParsedTitle({ id: "m2", title: "Newer" }),
      makeParsedTitle({ id: "m3", title: "Newest" }),
    ]);
    await rateTitle(userId, "m1", "LIKE");
    await backdate("ratings", and(eq(ratings.userId, userId), eq(ratings.titleId, "m1")), "2024-01-01 00:00:00");

    await watchTitle("m2", userId);
    await backdate("watched_titles", and(eq(watchedTitles.userId, userId), eq(watchedTitles.titleId, "m2")), "2025-06-01 00:00:00");

    await trackTitle("m3", userId);
    await backdate("tracked", and(eq(tracked.userId, userId), eq(tracked.titleId, "m3")), "2026-04-01 00:00:00");

    const res = await app.request("/user/activeuser/activity");
    const body = await res.json();
    expect(body.activities.map((a: any) => a.title.id)).toEqual(["m3", "m2", "m1"]);
  });

  it("paginates with cursor", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "m1", title: "One" }),
      makeParsedTitle({ id: "m2", title: "Two" }),
      makeParsedTitle({ id: "m3", title: "Three" }),
    ]);
    await rateTitle(userId, "m1", "LIKE");
    await backdate("ratings", and(eq(ratings.userId, userId), eq(ratings.titleId, "m1")), "2024-01-01 00:00:00");
    await rateTitle(userId, "m2", "LIKE");
    await backdate("ratings", and(eq(ratings.userId, userId), eq(ratings.titleId, "m2")), "2025-01-01 00:00:00");
    await rateTitle(userId, "m3", "LIKE");
    await backdate("ratings", and(eq(ratings.userId, userId), eq(ratings.titleId, "m3")), "2026-01-01 00:00:00");

    const firstRes = await app.request("/user/activeuser/activity?limit=2");
    const first = await firstRes.json();
    expect(first.activities).toHaveLength(2);
    expect(first.activities.map((a: any) => a.title.id)).toEqual(["m3", "m2"]);
    expect(first.has_more).toBe(true);
    expect(first.next_cursor).toBeTruthy();

    const secondRes = await app.request(`/user/activeuser/activity?limit=2&before=${encodeURIComponent(first.next_cursor)}`);
    const second = await secondRes.json();
    expect(second.activities).toHaveLength(1);
    expect(second.activities[0].title.id).toBe("m1");
    expect(second.has_more).toBe(false);
    expect(second.next_cursor).toBeNull();
  });

  it("returns empty activity for private profile", async () => {
    const privateId = await createUser("privateuser", "hash");
    await updateProfilePublic(privateId, "private");
    await upsertTitles([makeParsedTitle({ id: "m1", title: "Hidden" })]);
    await rateTitle(privateId, "m1", "LOVE");

    const res = await app.request("/user/privateuser/activity");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activities).toEqual([]);
  });

  it("owner can see their own private profile activity", async () => {
    await updateProfilePublic(userId, "private");
    await upsertTitles([makeParsedTitle({ id: "m1", title: "Hidden" })]);
    await rateTitle(userId, "m1", "LOVE");

    const res = await app.request("/user/activeuser/activity", { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activities).toHaveLength(1);
  });

  it("friends_only returns activity only to mutual followers", async () => {
    await updateProfilePublic(userId, "friends_only");
    await upsertTitles([makeParsedTitle({ id: "m1", title: "Friends Only" })]);
    await rateTitle(userId, "m1", "LIKE");

    const strangerId = await createUser("stranger", "hash");
    const strangerToken = await createSession(strangerId);
    const strangerRes = await app.request("/user/activeuser/activity", { headers: authHeaders(strangerToken) });
    expect((await strangerRes.json()).activities).toEqual([]);

    const friendId = await createUser("friend", "hash");
    const friendToken = await createSession(friendId);
    await follow(userId, friendId);
    await follow(friendId, userId);

    const friendRes = await app.request("/user/activeuser/activity", { headers: authHeaders(friendToken) });
    expect((await friendRes.json()).activities).toHaveLength(1);
  });

  it("rejects invalid limit", async () => {
    const res = await app.request("/user/activeuser/activity?limit=200");
    expect(res.status).toBe(400);
  });

  it("is case-insensitive on username", async () => {
    await upsertTitles([makeParsedTitle({ id: "m1", title: "Case Test" })]);
    await rateTitle(userId, "m1", "LIKE");
    const res = await app.request("/user/ACTIVEUSER/activity");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activities).toHaveLength(1);
  });
});
