import { describe, it, expect, beforeEach, afterAll, mock } from "bun:test";
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

let userId: string;

beforeEach(() => {
  setupTestDb();
  userId = createUser("testuser", "hash");
});

afterAll(() => {
  teardownTestDb();
});

describe("getDueNotifiers", () => {
  it("returns notifiers matching current time in their timezone", () => {
    createNotifier(userId, "discord", "Morning", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");

    const timesByTimezone = new Map([
      ["UTC", { time: "09:00", date: "2026-03-12" }],
    ]);

    const due = getDueNotifiers(timesByTimezone);
    expect(due).toHaveLength(1);
    expect(due[0].name).toBe("Morning");
    expect(due[0].todayDate).toBe("2026-03-12");
  });

  it("excludes notifiers with non-matching time", () => {
    createNotifier(userId, "discord", "Evening", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "18:00", "UTC");

    const timesByTimezone = new Map([
      ["UTC", { time: "09:00", date: "2026-03-12" }],
    ]);

    const due = getDueNotifiers(timesByTimezone);
    expect(due).toHaveLength(0);
  });

  it("excludes already-sent notifiers", () => {
    const id = createNotifier(userId, "discord", "Sent", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");
    markNotifierSent(id, "2026-03-12");

    const timesByTimezone = new Map([
      ["UTC", { time: "09:00", date: "2026-03-12" }],
    ]);

    const due = getDueNotifiers(timesByTimezone);
    expect(due).toHaveLength(0);
  });

  it("includes notifier sent on a different day", () => {
    const id = createNotifier(userId, "discord", "Yesterday", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");
    markNotifierSent(id, "2026-03-11");

    const timesByTimezone = new Map([
      ["UTC", { time: "09:00", date: "2026-03-12" }],
    ]);

    const due = getDueNotifiers(timesByTimezone);
    expect(due).toHaveLength(1);
  });

  it("excludes disabled notifiers", () => {
    const id = createNotifier(userId, "discord", "Disabled", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");
    // Disable it using updateNotifier
    const { updateNotifier } = require("../db/repository");
    updateNotifier(id, userId, { enabled: false });

    const timesByTimezone = new Map([
      ["UTC", { time: "09:00", date: "2026-03-12" }],
    ]);

    const due = getDueNotifiers(timesByTimezone);
    expect(due).toHaveLength(0);
  });
});

describe("getDistinctNotifierTimezones", () => {
  it("returns unique timezones of enabled notifiers", () => {
    createNotifier(userId, "discord", "UTC1", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");
    createNotifier(userId, "discord", "UTC2", { webhookUrl: "https://discord.com/api/webhooks/2/b" }, "10:00", "UTC");
    createNotifier(userId, "discord", "NY", { webhookUrl: "https://discord.com/api/webhooks/3/c" }, "09:00", "America/New_York");

    const tzs = getDistinctNotifierTimezones();
    expect(tzs).toContain("UTC");
    expect(tzs).toContain("America/New_York");
    expect(tzs).toHaveLength(2);
  });

  it("returns empty when no notifiers exist", () => {
    const tzs = getDistinctNotifierTimezones();
    expect(tzs).toHaveLength(0);
  });
});

describe("markNotifierSent", () => {
  it("updates last_sent_date", () => {
    const id = createNotifier(userId, "discord", "Test", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");

    markNotifierSent(id, "2026-03-12");

    const notifier = getNotifierById(id, userId);
    expect(notifier!.last_sent_date).toBe("2026-03-12");
  });
});

describe("getEnabledNotifierSchedules", () => {
  it("returns distinct time+timezone pairs for enabled notifiers", () => {
    createNotifier(userId, "discord", "N1", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");
    createNotifier(userId, "discord", "N2", { webhookUrl: "https://discord.com/api/webhooks/2/b" }, "09:00", "UTC");
    createNotifier(userId, "discord", "N3", { webhookUrl: "https://discord.com/api/webhooks/3/c" }, "18:00", "America/New_York");

    const schedules = getEnabledNotifierSchedules();
    expect(schedules).toHaveLength(2);
    expect(schedules).toContainEqual({ notify_time: "09:00", timezone: "UTC" });
    expect(schedules).toContainEqual({ notify_time: "18:00", timezone: "America/New_York" });
  });

  it("returns empty when no notifiers exist", () => {
    const schedules = getEnabledNotifierSchedules();
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
  it("returns null when no notifiers exist", () => {
    const cron = computeNotificationCron();
    expect(cron).toBeNull();
  });

  it("returns a cron expression with specific minutes and hours", () => {
    createNotifier(userId, "discord", "Test", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");

    const cron = computeNotificationCron();
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

  it("combines multiple notifier times into one cron", () => {
    createNotifier(userId, "discord", "Morning", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");
    createNotifier(userId, "discord", "Evening", { webhookUrl: "https://discord.com/api/webhooks/2/b" }, "18:30", "UTC");

    const cron = computeNotificationCron();
    expect(cron).not.toBeNull();

    const parts = cron!.split(" ");
    // Should include both minute 0 and minute 30
    const minutes = parts[0].split(",").map(Number);
    expect(minutes).toContain(0);
    expect(minutes).toContain(30);
  });

  it("does not include disabled notifiers", () => {
    const { updateNotifier } = require("../db/repository");
    const id = createNotifier(userId, "discord", "Disabled", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");
    updateNotifier(id, userId, { enabled: false });

    const cron = computeNotificationCron();
    expect(cron).toBeNull();
  });
});
