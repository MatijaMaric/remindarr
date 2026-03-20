import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser, createNotifier } from "../db/repository";
import {
  setScheduleCallback,
  refreshNotificationSchedule,
  computeNotificationCron,
  convertToLocalTime,
} from "./schedule";

let userId: string;

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("testuser", "hash");
});

afterAll(() => {
  teardownTestDb();
});

describe("setScheduleCallback", () => {
  it("refreshNotificationSchedule is a no-op when no callback is set", async () => {
    setScheduleCallback(null as any);
    await createNotifier(userId, "discord", "Test", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");
    // Should not throw
    await refreshNotificationSchedule();
  });

  it("calls the registered callback with computed cron", async () => {
    const calls: { name: string; cron: string }[] = [];
    setScheduleCallback((name, cron) => calls.push({ name, cron }));

    await createNotifier(userId, "discord", "Test", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");
    await refreshNotificationSchedule();

    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("send-notifications");
    expect(calls[0].cron).toContain("* * *");
  });

  it("uses fallback cron when no notifiers exist", async () => {
    const calls: { name: string; cron: string }[] = [];
    setScheduleCallback((name, cron) => calls.push({ name, cron }));

    await refreshNotificationSchedule();

    expect(calls).toHaveLength(1);
    expect(calls[0].cron).toBe("0 0 * * *");
  });
});
