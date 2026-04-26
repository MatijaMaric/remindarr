import { describe, it, expect, beforeEach, afterAll, spyOn } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { getRawDb } from "../bun-db";

import Sentry from "../../sentry";
spyOn(Sentry, "startSpan").mockImplementation((_opts: any, fn: any) => fn({}));
spyOn(Sentry, "captureException").mockImplementation(() => "");

import {
  upsertPlexLibraryItems,
  deleteStaleLibraryItems,
  deletePlexLibraryByIntegration,
  getPlexOffersForUser,
  PLEX_PROVIDER_ID,
} from "./plex-library";
import { createUser } from "./users";

function insertTitle(id: string) {
  getRawDb()
    .prepare(`INSERT INTO titles (id, object_type, tmdb_id, title, release_date) VALUES (?, 'MOVIE', '1', ?, '2024-01-01')`)
    .run(id, id);
}

function insertIntegration(id: string, userId: string, serverId: string) {
  getRawDb()
    .prepare(`INSERT INTO integrations (id, user_id, provider, name, config, enabled) VALUES (?, ?, 'plex', 'Plex', ?, 1)`)
    .run(id, userId, JSON.stringify({ plexToken: "tok", serverUrl: "http://plex", serverId, serverName: "Plex", plexUsername: "u", syncMovies: true, syncEpisodes: true }));
}

let userId: string;

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("user1", "hash");
});

afterAll(() => {
  teardownTestDb();
});

describe("upsertPlexLibraryItems", () => {
  it("inserts new items", async () => {
    insertTitle("movie-1");
    insertIntegration("int-1", userId, "srv-1");

    await upsertPlexLibraryItems([{
      integrationId: "int-1",
      userId,
      titleId: "movie-1",
      ratingKey: "rk-100",
      mediaType: "movie",
    }]);

    const row = getRawDb()
      .prepare(`SELECT rating_key FROM plex_library_items WHERE user_id = ? AND title_id = ?`)
      .get(userId, "movie-1") as { rating_key: string } | null;
    expect(row?.rating_key).toBe("rk-100");
  });

  it("updates ratingKey on conflict", async () => {
    insertTitle("movie-1");
    insertIntegration("int-1", userId, "srv-1");

    await upsertPlexLibraryItems([{
      integrationId: "int-1",
      userId,
      titleId: "movie-1",
      ratingKey: "rk-old",
      mediaType: "movie",
    }]);

    await upsertPlexLibraryItems([{
      integrationId: "int-1",
      userId,
      titleId: "movie-1",
      ratingKey: "rk-new",
      mediaType: "movie",
    }]);

    const row = getRawDb()
      .prepare(`SELECT rating_key FROM plex_library_items WHERE user_id = ? AND title_id = ?`)
      .get(userId, "movie-1") as { rating_key: string } | null;
    expect(row?.rating_key).toBe("rk-new");
  });

  it("is a no-op for empty array", async () => {
    await expect(upsertPlexLibraryItems([])).resolves.toBeUndefined();
  });
});

describe("deleteStaleLibraryItems", () => {
  it("removes items not in currentTitleIds", async () => {
    insertTitle("movie-1");
    insertTitle("movie-2");
    insertIntegration("int-1", userId, "srv-1");

    getRawDb().prepare(`INSERT INTO plex_library_items (integration_id, user_id, title_id, rating_key, media_type) VALUES (?, ?, ?, ?, ?)`)
      .run("int-1", userId, "movie-1", "rk-1", "movie");
    getRawDb().prepare(`INSERT INTO plex_library_items (integration_id, user_id, title_id, rating_key, media_type) VALUES (?, ?, ?, ?, ?)`)
      .run("int-1", userId, "movie-2", "rk-2", "movie");

    await deleteStaleLibraryItems("int-1", ["movie-1"]);

    const rows = getRawDb()
      .prepare(`SELECT title_id FROM plex_library_items WHERE integration_id = ?`)
      .all("int-1") as Array<{ title_id: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].title_id).toBe("movie-1");
  });

  it("deletes all items when currentTitleIds is empty", async () => {
    insertTitle("movie-1");
    insertIntegration("int-1", userId, "srv-1");

    getRawDb().prepare(`INSERT INTO plex_library_items (integration_id, user_id, title_id, rating_key, media_type) VALUES (?, ?, ?, ?, ?)`)
      .run("int-1", userId, "movie-1", "rk-1", "movie");

    await deleteStaleLibraryItems("int-1", []);

    const count = (getRawDb().prepare(`SELECT COUNT(*) as cnt FROM plex_library_items WHERE integration_id = ?`).get("int-1") as any).cnt;
    expect(count).toBe(0);
  });
});

describe("deletePlexLibraryByIntegration", () => {
  it("removes all items for the integration", async () => {
    insertTitle("movie-1");
    insertIntegration("int-1", userId, "srv-1");

    getRawDb().prepare(`INSERT INTO plex_library_items (integration_id, user_id, title_id, rating_key, media_type) VALUES (?, ?, ?, ?, ?)`)
      .run("int-1", userId, "movie-1", "rk-1", "movie");

    await deletePlexLibraryByIntegration("int-1");

    const count = (getRawDb().prepare(`SELECT COUNT(*) as cnt FROM plex_library_items`).get() as any).cnt;
    expect(count).toBe(0);
  });
});

describe("getPlexOffersForUser", () => {
  it("returns synthetic Plex offers with deep links", async () => {
    insertTitle("movie-1");
    insertIntegration("int-1", userId, "my-server-id");

    getRawDb().prepare(`INSERT INTO plex_library_items (integration_id, user_id, title_id, rating_key, media_type) VALUES (?, ?, ?, ?, ?)`)
      .run("int-1", userId, "movie-1", "rk-42", "movie");

    const result = await getPlexOffersForUser(["movie-1"], userId);

    const offers = result.get("movie-1");
    expect(offers).toHaveLength(1);
    const offer = offers![0];
    expect(offer.provider_id).toBe(PLEX_PROVIDER_ID);
    expect(offer.monetization_type).toBe("FLATRATE");
    expect(offer.provider_name).toBe("Plex");
    expect(offer.provider_technical_name).toBe("plex");
    expect(offer.url).toBe(
      "https://app.plex.tv/#!/server/my-server-id/details?key=%2Flibrary%2Fmetadata%2Frk-42"
    );
  });

  it("embeds watchSlug and mediaType in URL when plex_slug is set", async () => {
    insertTitle("movie-1");
    insertIntegration("int-1", userId, "my-server-id");

    getRawDb().prepare(`INSERT INTO plex_library_items (integration_id, user_id, title_id, rating_key, media_type, plex_slug) VALUES (?, ?, ?, ?, ?, ?)`)
      .run("int-1", userId, "movie-1", "rk-42", "movie", "zoolander");

    const result = await getPlexOffersForUser(["movie-1"], userId);
    const offer = result.get("movie-1")![0];
    expect(offer.url).toContain("watchSlug=zoolander");
    expect(offer.url).toContain("mediaType=movie");
  });

  it("returns empty map when user has no Plex library items", async () => {
    const result = await getPlexOffersForUser(["movie-1"], userId);
    expect(result.size).toBe(0);
  });

  it("returns empty map for empty titleIds", async () => {
    const result = await getPlexOffersForUser([], userId);
    expect(result.size).toBe(0);
  });

  it("handles more than 99 titleIds without hitting D1 param limit", async () => {
    insertIntegration("int-1", userId, "srv-1");
    const titleIds: string[] = [];
    for (let i = 1; i <= 120; i++) {
      const id = `movie-bulk-${i}`;
      insertTitle(id);
      titleIds.push(id);
      getRawDb()
        .prepare(`INSERT INTO plex_library_items (integration_id, user_id, title_id, rating_key, media_type) VALUES (?, ?, ?, ?, ?)`)
        .run("int-1", userId, id, `rk-${i}`, "movie");
    }

    const result = await getPlexOffersForUser(titleIds, userId);
    expect(result.size).toBe(120);
  });

  it("does not return offers for another user", async () => {
    insertTitle("movie-1");
    insertIntegration("int-1", userId, "srv-1");
    const otherUserId = await createUser("other", "hash2");

    getRawDb().prepare(`INSERT INTO plex_library_items (integration_id, user_id, title_id, rating_key, media_type) VALUES (?, ?, ?, ?, ?)`)
      .run("int-1", userId, "movie-1", "rk-1", "movie");

    const result = await getPlexOffersForUser(["movie-1"], otherUserId);
    expect(result.size).toBe(0);
  });
});
