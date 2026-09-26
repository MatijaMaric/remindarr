import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import {
  createUser,
  createSession,
  getSessionWithUser,
  follow,
  getUserActivity,
} from "../db/repository";
import { getRawDb } from "../db/bun-db";
import { requireAuth } from "../middleware/auth";
import episodeCommentsApp from "./episode-comments";
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
let aliceId: string;
let aliceToken: string;
let bobId: string;
let bobToken: string;
let episodeId: number;

const scope = {
  title_id: "show-1",
  season_number: 1,
  episode_number: 2,
};

beforeEach(async () => {
  setupTestDb();
  aliceId = await createUser("alice", "hash", "Alice");
  aliceToken = await createSession(aliceId);
  bobId = await createUser("bob", "hash", "Bob");
  bobToken = await createSession(bobId);

  const db = getRawDb();
  db.prepare(
    `INSERT INTO titles (id, object_type, title, release_date) VALUES (?, 'SHOW', 'Test Show', '2024-01-01')`,
  ).run("show-1");
  db.prepare(
    `INSERT INTO episodes (title_id, season_number, episode_number, name) VALUES (?, ?, ?, ?)`,
  ).run("show-1", 1, 2, "The Watch");
  episodeId = (
    db
      .prepare(
        `SELECT id FROM episodes WHERE title_id = ? AND season_number = ? AND episode_number = ?`,
      )
      .get("show-1", 1, 2) as { id: number }
  ).id;

  app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", createMockAuth() as any);
    await next();
  });
  app.use("/episode-comments/*", requireAuth);
  app.use("/episode-comments", requireAuth);
  app.route("/episode-comments", episodeCommentsApp);
});

afterAll(() => {
  teardownTestDb();
});

function authHeaders(token: string) {
  return {
    Cookie: `better-auth.session_token=${token}`,
    "Content-Type": "application/json",
  };
}

function watch(userId: string) {
  getRawDb()
    .prepare(`INSERT INTO watched_episodes (episode_id, user_id) VALUES (?, ?)`)
    .run(episodeId, userId);
}

function postComment(
  token: string,
  body: string,
  visibility?: "public" | "friends_only",
) {
  return app.request("/episode-comments", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ ...scope, body, visibility }),
  });
}

describe("validation", () => {
  it("rejects a missing body", async () => {
    watch(aliceId);
    const res = await app.request("/episode-comments", {
      method: "POST",
      headers: authHeaders(aliceToken),
      body: JSON.stringify({ ...scope }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeInstanceOf(Array);
  });
});

it("happy path — posts the comment the episode page sends", async () => {
  watch(aliceId);
  const res = await postComment(aliceToken, "Loved this", "public");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.comment.body).toBe("Loved this");
  expect(body.comment.visibility).toBe("public");
  expect(body.comment.can_delete).toBe(true);
});

describe("episode comments", () => {
  it("requires auth", async () => {
    const res = await app.request(
      "/episode-comments?title_id=show-1&season_number=1&episode_number=2",
    );
    expect(res.status).toBe(401);
  });

  it("blocks viewers who have not watched the episode", async () => {
    const res = await app.request(
      "/episode-comments?title_id=show-1&season_number=1&episode_number=2",
      { headers: authHeaders(aliceToken) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when the episode does not exist", async () => {
    watch(aliceId);
    const res = await app.request(
      "/episode-comments?title_id=show-1&season_number=9&episode_number=9",
      { headers: authHeaders(aliceToken) },
    );
    expect(res.status).toBe(404);
  });

  it("hides friends-only comments from watchers who are not mutual followers", async () => {
    watch(aliceId);
    watch(bobId);
    const created = await postComment(aliceToken, "Secret", "friends_only");
    expect(created.status).toBe(200);

    const bobView = await app.request(
      "/episode-comments?title_id=show-1&season_number=1&episode_number=2",
      { headers: authHeaders(bobToken) },
    );
    expect(bobView.status).toBe(200);
    expect((await bobView.json()).comments).toHaveLength(0);

    await follow(aliceId, bobId);
    await follow(bobId, aliceId);

    const friendView = await app.request(
      "/episode-comments?title_id=show-1&season_number=1&episode_number=2",
      { headers: authHeaders(bobToken) },
    );
    const friendBody = await friendView.json();
    expect(friendBody.comments).toHaveLength(1);
    expect(friendBody.comments[0].body).toBe("Secret");
  });

  it("shows public comments to any watcher", async () => {
    watch(aliceId);
    watch(bobId);
    await postComment(aliceToken, "Hello", "public");
    const res = await app.request(
      "/episode-comments?title_id=show-1&season_number=1&episode_number=2",
      { headers: authHeaders(bobToken) },
    );
    const body = await res.json();
    expect(body.comments.map((c: { body: string }) => c.body)).toEqual([
      "Hello",
    ]);
    expect(body.emojis).toContain("👍");
  });

  it("lets the author delete their comment and not someone else's", async () => {
    watch(aliceId);
    watch(bobId);
    const created = await postComment(aliceToken, "Mine", "public");
    const id = (await created.json()).comment.id as string;

    const stolen = await app.request(`/episode-comments/${id}`, {
      method: "DELETE",
      headers: authHeaders(bobToken),
    });
    expect(stolen.status).toBe(404);

    const removed = await app.request(`/episode-comments/${id}`, {
      method: "DELETE",
      headers: authHeaders(aliceToken),
    });
    expect(removed.status).toBe(200);
  });

  it("toggles an emoji reaction and rejects an unknown emoji", async () => {
    watch(aliceId);
    watch(bobId);
    const created = await postComment(aliceToken, "React here", "public");
    const id = (await created.json()).comment.id as string;

    const bad = await app.request(`/episode-comments/${id}/reactions`, {
      method: "POST",
      headers: authHeaders(bobToken),
      body: JSON.stringify({ emoji: "nope" }),
    });
    expect(bad.status).toBe(400);
    expect((await bad.json()).issues).toBeInstanceOf(Array);

    const added = await app.request(`/episode-comments/${id}/reactions`, {
      method: "POST",
      headers: authHeaders(bobToken),
      body: JSON.stringify({ emoji: "👍" }),
    });
    expect(added.status).toBe(200);
    const addedBody = await added.json();
    expect(
      addedBody.comment.reactions.find(
        (r: { emoji: string }) => r.emoji === "👍",
      ),
    ).toMatchObject({ count: 1, reacted: true });

    const removed = await app.request(`/episode-comments/${id}/reactions`, {
      method: "POST",
      headers: authHeaders(bobToken),
      body: JSON.stringify({ emoji: "👍" }),
    });
    const removedBody = await removed.json();
    expect(
      removedBody.comment.reactions.find(
        (r: { emoji: string }) => r.emoji === "👍",
      ),
    ).toMatchObject({ count: 0, reacted: false });
  });

  it("does not let an unwatched user react", async () => {
    watch(aliceId);
    const created = await postComment(aliceToken, "No spoilers", "public");
    const id = (await created.json()).comment.id as string;
    const res = await app.request(`/episode-comments/${id}/reactions`, {
      method: "POST",
      headers: authHeaders(bobToken),
      body: JSON.stringify({ emoji: "❤️" }),
    });
    expect(res.status).toBe(403);
  });

  it("hides a friends-only comment from a non-friend reaction", async () => {
    watch(aliceId);
    watch(bobId);
    const created = await postComment(aliceToken, "Friends", "friends_only");
    const id = (await created.json()).comment.id as string;
    const res = await app.request(`/episode-comments/${id}/reactions`, {
      method: "POST",
      headers: authHeaders(bobToken),
      body: JSON.stringify({ emoji: "😂" }),
    });
    expect(res.status).toBe(404);
  });

  it("adds a spoiler-free activity event and hides friends-only posts from the public", async () => {
    watch(aliceId);
    const publicRes = await postComment(aliceToken, "Public thought", "public");
    const publicId = (await publicRes.json()).comment.id as string;
    const friendsRes = await postComment(
      aliceToken,
      "Friend thought",
      "friends_only",
    );
    const friendsId = (await friendsRes.json()).comment.id as string;

    const own = await getUserActivity(aliceId, { viewerRelation: "self" });
    const ownIds = own.activities
      .filter((event) => event.type === "episode_comment")
      .map((event) => event.id);
    expect(ownIds).toContain(`ec:${publicId}`);
    expect(ownIds).toContain(`ec:${friendsId}`);
    const publicEvent = own.activities.find(
      (event) => event.id === `ec:${publicId}`,
    );
    expect(publicEvent?.message).toBeUndefined();
    expect(publicEvent?.episode).toMatchObject({
      season_number: 1,
      episode_number: 2,
    });

    const publicViewer = await getUserActivity(aliceId, {
      viewerRelation: "public",
    });
    const visible = publicViewer.activities
      .filter((event) => event.type === "episode_comment")
      .map((event) => event.id);
    expect(visible).toEqual([`ec:${publicId}`]);

    const friendViewer = await getUserActivity(aliceId, {
      viewerRelation: "friend",
    });
    const friendVisible = friendViewer.activities
      .filter((event) => event.type === "episode_comment")
      .map((event) => event.id);
    expect(friendVisible).toContain(`ec:${friendsId}`);
  });
});
