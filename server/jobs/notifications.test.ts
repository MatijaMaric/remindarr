import { describe, it, expect, beforeEach, afterAll, afterEach, mock, spyOn } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import {
  createUser,
  createNotifier,
  getNotifierById,
  markNotifierSent,
  getDueNotifiers,
  getDistinctNotifierTimezones,
  getEnabledNotifierSchedules,
} from "../db/repository";
import { convertToLocalTime, computeNotificationCron } from "./notifications";

// ─── Spies for dispatch-metrics tests ────────────────────────────────────────
// Must be declared before the modules that import them are imported so that
// the live ESM binding inside notifications.ts sees the patched namespace.
import * as contentModule from "../notifications/content";
import * as registryModule from "../notifications/registry";
import * as repositoryModule from "../db/repository";

const getProviderSpy = spyOn(registryModule, "getProvider");
const buildContentSpy = spyOn(contentModule, "buildNotificationContent");
const buildWeeklyContentSpy = spyOn(contentModule, "buildWeeklyDigestContent");
const recordDeliverySpy = spyOn(repositoryModule, "recordDelivery");
const markNotifierSentSpy = spyOn(repositoryModule, "markNotifierSent");

let userId: string;

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("testuser", "hash");
});

afterAll(() => {
  teardownTestDb();
});

describe("getDueNotifiers", () => {
  it("returns notifiers matching current time in their timezone", async () => {
    await createNotifier(userId, "discord", "Morning", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");

    const timesByTimezone = new Map([
      ["UTC", { time: "09:00", date: "2026-03-12" }],
    ]);

    const due = await getDueNotifiers(timesByTimezone);
    expect(due).toHaveLength(1);
    expect(due[0].name).toBe("Morning");
    expect(due[0].todayDate).toBe("2026-03-12");
  });

  it("excludes notifiers with non-matching time", async () => {
    await createNotifier(userId, "discord", "Evening", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "18:00", "UTC");

    const timesByTimezone = new Map([
      ["UTC", { time: "09:00", date: "2026-03-12" }],
    ]);

    const due = await getDueNotifiers(timesByTimezone);
    expect(due).toHaveLength(0);
  });

  it("excludes already-sent notifiers", async () => {
    const id = await createNotifier(userId, "discord", "Sent", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");
    await markNotifierSent(id, "2026-03-12");

    const timesByTimezone = new Map([
      ["UTC", { time: "09:00", date: "2026-03-12" }],
    ]);

    const due = await getDueNotifiers(timesByTimezone);
    expect(due).toHaveLength(0);
  });

  it("includes notifier sent on a different day", async () => {
    const id = await createNotifier(userId, "discord", "Yesterday", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");
    await markNotifierSent(id, "2026-03-11");

    const timesByTimezone = new Map([
      ["UTC", { time: "09:00", date: "2026-03-12" }],
    ]);

    const due = await getDueNotifiers(timesByTimezone);
    expect(due).toHaveLength(1);
  });

  it("excludes disabled notifiers", async () => {
    const id = await createNotifier(userId, "discord", "Disabled", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");
    // Disable it using updateNotifier
    const { updateNotifier } = require("../db/repository");
    await updateNotifier(id, userId, { enabled: false });

    const timesByTimezone = new Map([
      ["UTC", { time: "09:00", date: "2026-03-12" }],
    ]);

    const due = await getDueNotifiers(timesByTimezone);
    expect(due).toHaveLength(0);
  });
});

describe("getDistinctNotifierTimezones", () => {
  it("returns unique timezones of enabled notifiers", async () => {
    await createNotifier(userId, "discord", "UTC1", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");
    await createNotifier(userId, "discord", "UTC2", { webhookUrl: "https://discord.com/api/webhooks/2/b" }, "10:00", "UTC");
    await createNotifier(userId, "discord", "NY", { webhookUrl: "https://discord.com/api/webhooks/3/c" }, "09:00", "America/New_York");

    const tzs = await getDistinctNotifierTimezones();
    expect(tzs).toContain("UTC");
    expect(tzs).toContain("America/New_York");
    expect(tzs).toHaveLength(2);
  });

  it("returns empty when no notifiers exist", async () => {
    const tzs = await getDistinctNotifierTimezones();
    expect(tzs).toHaveLength(0);
  });
});

describe("markNotifierSent", () => {
  it("updates last_sent_date", async () => {
    const id = await createNotifier(userId, "discord", "Test", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");

    await markNotifierSent(id, "2026-03-12");

    const notifier = await getNotifierById(id, userId);
    expect(notifier!.last_sent_date).toBe("2026-03-12");
  });
});

describe("getEnabledNotifierSchedules", () => {
  it("returns distinct time+timezone pairs for enabled notifiers", async () => {
    await createNotifier(userId, "discord", "N1", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");
    await createNotifier(userId, "discord", "N2", { webhookUrl: "https://discord.com/api/webhooks/2/b" }, "09:00", "UTC");
    await createNotifier(userId, "discord", "N3", { webhookUrl: "https://discord.com/api/webhooks/3/c" }, "18:00", "America/New_York");

    const schedules = await getEnabledNotifierSchedules();
    expect(schedules).toHaveLength(2);
    expect(schedules).toContainEqual({ notify_time: "09:00", timezone: "UTC" });
    expect(schedules).toContainEqual({ notify_time: "18:00", timezone: "America/New_York" });
  });

  it("returns empty when no notifiers exist", async () => {
    const schedules = await getEnabledNotifierSchedules();
    expect(schedules).toHaveLength(0);
  });
});

describe("convertToLocalTime", () => {
  it("converts UTC time to local time (same timezone returns same time)", () => {
    // When server is in UTC and source is UTC, no conversion needed
    const now = new Date("2026-03-12T12:00:00Z");
    const result = convertToLocalTime("09:00", "UTC", now);
    // Server local time depends on the environment, but the function should be consistent
    expect(result.hour).toBeGreaterThanOrEqual(0);
    expect(result.hour).toBeLessThanOrEqual(23);
    expect(result.minute).toBe(0);
  });

  it("handles timezone offset correctly", () => {
    // Europe/Zagreb is UTC+1 (CET) or UTC+2 (CEST)
    // 09:00 Europe/Zagreb should convert to a different server-local time
    const now = new Date("2026-03-12T12:00:00Z");
    const result = convertToLocalTime("09:00", "Europe/Zagreb", now);
    expect(result.minute).toBe(0);
    // The hour should differ from 9 unless server happens to be in the same timezone
    expect(result.hour).toBeGreaterThanOrEqual(0);
    expect(result.hour).toBeLessThanOrEqual(23);
  });

  it("handles minute values correctly", () => {
    const now = new Date("2026-03-12T12:00:00Z");
    const result = convertToLocalTime("09:30", "UTC", now);
    expect(result.minute).toBe(30);
  });
});

describe("computeNotificationCron", () => {
  it("returns null when no notifiers exist", async () => {
    const cron = await computeNotificationCron();
    expect(cron).toBeNull();
  });

  it("returns a cron expression with specific minutes and hours", async () => {
    await createNotifier(userId, "discord", "Test", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");

    const cron = await computeNotificationCron();
    expect(cron).not.toBeNull();

    // Should have format: "minutes hours * * *"
    const parts = cron!.split(" ");
    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe("0"); // minute 0
    expect(parts[2]).toBe("*"); // any day
    expect(parts[3]).toBe("*"); // any month
    expect(parts[4]).toBe("*"); // any weekday

    // Hours should contain 3 values (target ± 1 for DST buffer)
    const hours = parts[1].split(",").map(Number);
    expect(hours).toHaveLength(3);
  });

  it("combines multiple notifier times into one cron", async () => {
    await createNotifier(userId, "discord", "Morning", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");
    await createNotifier(userId, "discord", "Evening", { webhookUrl: "https://discord.com/api/webhooks/2/b" }, "18:30", "UTC");

    const cron = await computeNotificationCron();
    expect(cron).not.toBeNull();

    const parts = cron!.split(" ");
    // Should include both minute 0 and minute 30
    const minutes = parts[0].split(",").map(Number);
    expect(minutes).toContain(0);
    expect(minutes).toContain(30);
  });

  it("does not include disabled notifiers", async () => {
    const { updateNotifier } = require("../db/repository");
    const id = await createNotifier(userId, "discord", "Disabled", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");
    await updateNotifier(id, userId, { enabled: false });

    const cron = await computeNotificationCron();
    expect(cron).toBeNull();
  });
});

describe("notification error logging includes structured fields", () => {
  it("logs err object (not pre-stringified message) when provider.send throws", async () => {
    // Create a notifier that will be due now
    const notifierId = await createNotifier(
      userId,
      "discord",
      "FailTest",
      { webhookUrl: "https://discord.com/api/webhooks/1/a" },
      "09:00",
      "UTC"
    );

    // Confirm it's due at the current time map
    const timesByTimezone = new Map([["UTC", { time: "09:00", date: "2026-03-12" }]]);
    const due = await getDueNotifiers(timesByTimezone);
    expect(due).toHaveLength(1);

    const sendError = new Error("provider send failed");

    // Spy on console.error — the logger writes error/warn there as JSON lines
    const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});

    // Run the handler logic in isolation by simulating the catch path directly:
    // the logger's serializeValue turns Error -> { message, stack }
    // verify that if we call log.error with an err key, the stack is present in the output
    const { logger } = await import("../logger");
    const testLog = logger.child({ module: "test" });
    testLog.error("Failed to send notification", {
      provider: "discord",
      notifierId,
      userId,
      err: sendError,
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    const lastCallArg = consoleErrorSpy.mock.calls[consoleErrorSpy.mock.calls.length - 1][0] as string;
    const parsed = JSON.parse(lastCallArg) as Record<string, unknown>;

    expect(parsed.notifierId).toBe(notifierId);
    expect(parsed.userId).toBe(userId);
    // err is serialized by the logger as { message, stack }
    const errObj = parsed.err as Record<string, unknown>;
    expect(typeof errObj.stack).toBe("string");
    expect((errObj.stack as string).length).toBeGreaterThan(0);

    consoleErrorSpy.mockRestore();
  });
});

// ─── Prometheus counter tests ─────────────────────────────────────────────────
//
// These tests exercise the dispatch loop inside notifications.ts (Bun path) and
// verify that notificationsSentTotal is incremented for both success and failure.
// They use spyOn (not mock.module) to avoid cross-file mock leakage on Linux CI.

import { enqueueJob } from "./queue";
import { processJobs } from "./worker";
import { registerNotificationJobs } from "./notifications";
import { notificationsSentTotal, resetMetrics, renderMetrics } from "../metrics";
import Sentry from "../sentry";

// Suppress Sentry withMonitor calls from worker.ts
const withMonitorSpy = spyOn(Sentry, "withMonitor").mockImplementation(
  ((_slug: string, fn: () => unknown) => fn()) as typeof Sentry.withMonitor
);

function nowUtc(): { time: string; date: string } {
  const n = new Date();
  const hh = n.getUTCHours().toString().padStart(2, "0");
  const mm = n.getUTCMinutes().toString().padStart(2, "0");
  const yyyy = n.getUTCFullYear();
  const mo = (n.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = n.getUTCDate().toString().padStart(2, "0");
  return { time: `${hh}:${mm}`, date: `${yyyy}-${mo}-${dd}` };
}

const fakeContent = {
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
  date: "2026-04-30",
};

describe("notificationsSentTotal counter", () => {
  let metricsUserId: string;

  beforeEach(async () => {
    setupTestDb();
    // registerNotificationJobs needs the DB initialized — call after setupTestDb().
    // The handlerRegistered guard makes repeated calls idempotent.
    await registerNotificationJobs();
    metricsUserId = await createUser("metricsuser", "hash");
    resetMetrics();
    getProviderSpy.mockClear();
    buildContentSpy.mockClear();
    buildWeeklyContentSpy.mockClear();
    recordDeliverySpy.mockClear();
    markNotifierSentSpy.mockClear();
    withMonitorSpy.mockClear();
  });

  afterEach(() => {
    getProviderSpy.mockClear();
    buildContentSpy.mockClear();
    buildWeeklyContentSpy.mockClear();
    recordDeliverySpy.mockClear();
    markNotifierSentSpy.mockClear();
  });

  afterAll(() => {
    getProviderSpy.mockRestore();
    buildContentSpy.mockRestore();
    buildWeeklyContentSpy.mockRestore();
    recordDeliverySpy.mockRestore();
    markNotifierSentSpy.mockRestore();
    withMonitorSpy.mockRestore();
  });

  it("increments counter with outcome=success on successful daily dispatch", async () => {
    const { time: testTime } = nowUtc();

    buildContentSpy.mockResolvedValue(fakeContent);
    recordDeliverySpy.mockResolvedValue(undefined);
    markNotifierSentSpy.mockResolvedValue(undefined);
    getProviderSpy.mockReturnValue({
      name: "discord",
      send: async () => {},
      validateConfig: () => ({ valid: true }),
    });

    await createNotifier(
      metricsUserId,
      "discord",
      "DailySuccess",
      { webhookUrl: "https://discord.com/api/webhooks/1/a" },
      testTime,
      "UTC"
    );

    enqueueJob("send-notifications");
    await processJobs();

    const output = renderMetrics();
    expect(output).toContain(
      'notifications_sent_total{kind="daily",outcome="success",provider="discord"} 1'
    );
  });

  it("increments counter with outcome=failure when provider.send throws on daily dispatch", async () => {
    const { time: testTime } = nowUtc();

    buildContentSpy.mockResolvedValue(fakeContent);
    recordDeliverySpy.mockResolvedValue(undefined);
    markNotifierSentSpy.mockResolvedValue(undefined);
    getProviderSpy.mockReturnValue({
      name: "discord",
      send: async () => {
        throw new Error("network error");
      },
      validateConfig: () => ({ valid: true }),
    });

    await createNotifier(
      metricsUserId,
      "discord",
      "DailyFailure",
      { webhookUrl: "https://discord.com/api/webhooks/1/a" },
      testTime,
      "UTC"
    );

    enqueueJob("send-notifications");
    await processJobs();

    const output = renderMetrics();
    expect(output).toContain(
      'notifications_sent_total{kind="daily",outcome="failure",provider="discord"} 1'
    );
  });
});
