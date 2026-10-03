import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import {
  createUser,
  getOwnedFormats,
  getTitleById,
  upsertTitles,
} from "../db/repository";
import ownedApp from "./owned";
import type { AppEnv } from "../types";

let app: Hono<AppEnv>;
let userId: string;

function put(titleId: string, body: unknown) {
  return app.request(`/owned/${titleId}`, {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("owner", "hash");
  await upsertTitles([makeParsedTitle({ id: "movie-1" })]);
  app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("user", {
      id: userId,
      username: "owner",
      name: null,
      role: null,
      is_admin: false,
    });
    await next();
  });
  app.route("/owned", ownedApp);
});

afterAll(() => {
  teardownTestDb();
});

describe("PUT /owned/:titleId", () => {
  it("happy path — sets formats and returns them deduplicated", async () => {
    const res = await put("movie-1", { formats: ["bluray", "dvd", "dvd"] });
    expect(res.status).toBe(200);
    expect((await res.json()).formats).toEqual(["bluray", "dvd"]);
    expect(await getOwnedFormats(userId, "movie-1")).toEqual(["bluray", "dvd"]);
  });

  it("replaces existing formats and [] removes them all", async () => {
    await put("movie-1", { formats: ["bluray", "dvd"] });
    await put("movie-1", { formats: ["uhd_bluray", "dvd"] });
    expect(await getOwnedFormats(userId, "movie-1")).toEqual([
      "dvd",
      "uhd_bluray",
    ]);

    await put("movie-1", { formats: [] });
    expect(await getOwnedFormats(userId, "movie-1")).toEqual([]);
  });

  it("exposes owned_formats on the title detail only for the owner", async () => {
    await put("movie-1", { formats: ["vhs"] });
    expect((await getTitleById("movie-1", userId))?.owned_formats).toEqual([
      "vhs",
    ]);
    const other = await createUser("other", "hash");
    expect((await getTitleById("movie-1", other))?.owned_formats).toEqual([]);
    expect((await getTitleById("movie-1"))?.owned_formats).toEqual([]);
  });

  it("returns 404 for an unknown title", async () => {
    const res = await put("movie-missing", { formats: ["dvd"] });
    expect(res.status).toBe(404);
  });

  describe("validation", () => {
    it("rejects missing formats", async () => {
      const res = await put("movie-1", {});
      expect(res.status).toBe(400);
      expect((await res.json()).issues).toBeInstanceOf(Array);
    });

    it("rejects an unknown format", async () => {
      const res = await put("movie-1", { formats: ["laserdisc"] });
      expect(res.status).toBe(400);
    });
  });
});
