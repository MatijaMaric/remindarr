import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { getDb, notifiers } from "../schema";
import { createNotifier, createUser } from "./index";
import {
  deletePersonCreditAlerts,
  followPerson,
  getEnabledNotifierIdsForPersonFollowers,
  getFollowedPeople,
  insertPersonCreditAlerts,
  isFollowingPerson,
  listFollowedPersonIds,
  listPersonCreditAlerts,
  unfollowPerson,
} from "./person-follows";

let userId: string;

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("alice", "hash");
});

afterAll(() => {
  teardownTestDb();
});

const alert = (creditKey: string) => ({
  personId: 31,
  creditKey,
  personName: "Tom Hanks",
  title: creditKey,
  role: null,
  releaseDate: null,
  posterPath: null,
});

describe("person follows", () => {
  it("follows, lists by name and unfollows", async () => {
    await followPerson(userId, { id: 2, name: "Zoe", profilePath: null }, []);
    await followPerson(
      userId,
      { id: 1, name: "Ann", profilePath: "/a.jpg" },
      [],
    );
    // Re-following keeps the original snapshot rather than failing.
    await followPerson(userId, { id: 1, name: "Ann", profilePath: null }, []);

    expect(await getFollowedPeople(userId)).toEqual([
      { id: 1, name: "Ann", profile_path: "/a.jpg" },
      { id: 2, name: "Zoe", profile_path: null },
    ]);
    expect(await isFollowingPerson(userId, 1)).toBe(true);
    expect((await listFollowedPersonIds()).sort()).toEqual([1, 2]);

    await unfollowPerson(userId, 1);
    expect(await isFollowingPerson(userId, 1)).toBe(false);
  });

  it("returns only enabled notifiers of followers", async () => {
    const on = await createNotifier(
      userId,
      "discord",
      "On",
      {},
      "09:00",
      "UTC",
    );
    const off = await createNotifier(
      userId,
      "discord",
      "Off",
      {},
      "09:00",
      "UTC",
    );
    await getDb()
      .update(notifiers)
      .set({ enabled: 0 })
      .where(eq(notifiers.id, off))
      .run();
    await followPerson(userId, { id: 31, name: "Tom", profilePath: null }, []);

    const byUser = await getEnabledNotifierIdsForPersonFollowers(31);
    expect(byUser.get(userId)).toEqual([on]);
  });
});

describe("person credit alerts", () => {
  it("deletes only the alerts that were sent", async () => {
    const id = await createNotifier(userId, "discord", "D", {}, "09:00", "UTC");
    await insertPersonCreditAlerts([id], [alert("movie:1"), alert("movie:2")]);
    await insertPersonCreditAlerts([id], [alert("movie:1")]); // duplicate ignored

    await deletePersonCreditAlerts(id, [alert("movie:1")]);

    expect((await listPersonCreditAlerts(id)).map((a) => a.creditKey)).toEqual([
      "movie:2",
    ]);
  });

  it("are removed with their notifier", async () => {
    const id = await createNotifier(userId, "discord", "D", {}, "09:00", "UTC");
    await insertPersonCreditAlerts([id], [alert("movie:1")]);
    await getDb().delete(notifiers).where(eq(notifiers.id, id)).run();
    expect(await listPersonCreditAlerts(id)).toEqual([]);
  });
});
