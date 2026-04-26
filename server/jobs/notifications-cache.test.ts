/**
 * Regression tests for the N+1 fix in notification processing.
 *
 * buildNotificationContent() fires two DB queries per (userId, date) pair.
 * Before the fix, it was called once per notifier — so 3 notifiers for the
 * same user+date meant 6 queries instead of 2.  The per-invocation Map cache
 * in handleSendNotifications (processor.ts) collapses those duplicate calls.
 *
 * We use spyOn (not mock.module) here so the mock does not leak into other
 * test files — spyOn patches the live namespace object in-place and can be
 * restored per-test.  Since processor.ts imports buildNotificationContent as
 * a live ESM binding from the same namespace object, spyOn intercepts calls
 * from within processor.ts as well.
 */
import { describe, it, expect, beforeEach, afterAll, afterEach, spyOn } from "bun:test";

import * as contentModule from "../notifications/content";
import * as registryModule from "../notifications/registry";

// ─── Spies (top-level, before processor.ts is imported, so the live binding
//     in processor.ts resolves to the patched namespace property) ─────────────

const buildContentSpy = spyOn(contentModule, "buildNotificationContent");
const getProviderSpy = spyOn(registryModule, "getProvider");

// ─── Static imports (after spy setup) ────────────────────────────────────────

import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser, createNotifier, getDueNotifiers } from "../db/repository";
import { getDb, jobs } from "../db/schema";
import { processPendingJobs } from "./processor";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the current UTC time as "HH:mm" and date as "YYYY-MM-DD".
 * Using real current time means notifiers created at this time are
 * considered due by handleSendNotifications without clock-mocking.
 */
function nowUtc(): { time: string; date: string } {
  const n = new Date();
  const hh = n.getUTCHours().toString().padStart(2, "0");
  const mm = n.getUTCMinutes().toString().padStart(2, "0");
  const yyyy = n.getUTCFullYear();
  const mo = (n.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = n.getUTCDate().toString().padStart(2, "0");
  return { time: `${hh}:${mm}`, date: `${yyyy}-${mo}-${dd}` };
}

async function insertSendNotificationsJob() {
  const db = getDb();
  await db.insert(jobs).values({
    name: "send-notifications",
    status: "pending",
    runAt: new Date().toISOString(),
  });
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

let userId: string;

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("testuser", "hash");
});

afterAll(() => {
  teardownTestDb();
  buildContentSpy.mockRestore();
  getProviderSpy.mockRestore();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("notification content caching (N+1 fix)", () => {
  beforeEach(() => {
    // Provide a mock provider so send() doesn't make real HTTP calls
    getProviderSpy.mockReturnValue({
      name: "discord",
      send: async () => {},
      validateConfig: () => ({ valid: true }),
    });
  });

  afterEach(() => {
    buildContentSpy.mockClear();
    getProviderSpy.mockClear();
  });

  it("calls buildNotificationContent exactly once for 3 notifiers sharing the same user+date", async () => {
    const { time: testTime, date: testDate } = nowUtc();

    // Return content with an episode so the notifiers are not skipped as empty
    buildContentSpy.mockResolvedValue({
      episodes: [
        {
          showTitle: "Test Show",
          seasonNumber: 1,
          episodeNumber: 1,
          episodeName: "Pilot",
          posterUrl: null,
          offers: [],
        },
      ],
      movies: [],
      date: testDate,
    });

    // 3 notifiers for the same user at the same time — all due simultaneously.
    // Without the cache they would each trigger 2 DB queries (6 total).
    await createNotifier(userId, "discord", "N1", { webhookUrl: "https://discord.com/a" }, testTime, "UTC");
    await createNotifier(userId, "discord", "N2", { webhookUrl: "https://discord.com/b" }, testTime, "UTC");
    await createNotifier(userId, "discord", "N3", { webhookUrl: "https://discord.com/c" }, testTime, "UTC");

    // Sanity check: confirm all 3 are picked up as due
    const timesByTimezone = new Map([["UTC", { time: testTime, date: testDate }]]);
    const due = await getDueNotifiers(timesByTimezone);
    expect(due).toHaveLength(3);

    await insertSendNotificationsJob();
    await processPendingJobs();

    // The per-invocation cache should collapse 3 calls into 1 for this userId+date
    expect(buildContentSpy).toHaveBeenCalledTimes(1);
    expect(buildContentSpy).toHaveBeenCalledWith(userId, testDate);
  });

  it("calls buildNotificationContent once per user when 2 different users share the same date", async () => {
    const { time: testTime, date: testDate } = nowUtc();

    buildContentSpy.mockResolvedValue({
      episodes: [
        {
          showTitle: "Test Show",
          seasonNumber: 1,
          episodeNumber: 1,
          episodeName: "Pilot",
          posterUrl: null,
          offers: [],
        },
      ],
      movies: [],
      date: testDate,
    });

    const userId2 = await createUser("testuser2", "hash2");

    // User 1 has 2 notifiers, user 2 has 1 — 3 total, all due at the same time
    await createNotifier(userId, "discord", "U1-N1", { webhookUrl: "https://discord.com/a" }, testTime, "UTC");
    await createNotifier(userId, "discord", "U1-N2", { webhookUrl: "https://discord.com/b" }, testTime, "UTC");
    await createNotifier(userId2, "discord", "U2-N1", { webhookUrl: "https://discord.com/c" }, testTime, "UTC");

    // Sanity check: all 3 are due
    const timesByTimezone = new Map([["UTC", { time: testTime, date: testDate }]]);
    const due = await getDueNotifiers(timesByTimezone);
    expect(due).toHaveLength(3);

    await insertSendNotificationsJob();
    await processPendingJobs();

    // 2 unique users → content built twice, not 3 times
    expect(buildContentSpy).toHaveBeenCalledTimes(2);
    const calledUserIds = buildContentSpy.mock.calls.map((c) => c[0] as string);
    expect(calledUserIds).toContain(userId);
    expect(calledUserIds).toContain(userId2);
  });
});
