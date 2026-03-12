import { describe, it, expect, beforeEach, afterAll, mock } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import {
  createUser,
  createNotifier,
  getNotifierById,
  markNotifierSent,
  getDueNotifiers,
  getDistinctNotifierTimezones,
} from "../db/repository";

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
