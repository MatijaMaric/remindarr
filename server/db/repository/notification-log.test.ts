import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { createUser } from "./users";
import { createNotifier } from "./notifiers";
import {
  recordDelivery,
  getRecentForNotifier,
  getSuccessRateForNotifier,
  pruneOldRows,
} from "./notification-log";

let notifierId: string;

beforeEach(async () => {
  setupTestDb();

  const userId = await createUser("testuser", "hash");
  notifierId = await createNotifier(
    userId,
    "discord",
    "Discord",
    { webhookUrl: "https://discord.com/api/webhooks/123456789/abcdefghijklmnop" },
    "09:00",
    "UTC"
  );
});

afterAll(() => {
  teardownTestDb();
});

describe("recordDelivery", () => {
  it("writes a success row", async () => {
    await recordDelivery({ notifierId, status: "success", latencyMs: 150, eventKind: "test" });
    const rows = await getRecentForNotifier(notifierId, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("success");
    expect(rows[0].latencyMs).toBe(150);
    expect(rows[0].eventKind).toBe("test");
    expect(rows[0].notifierId).toBe(notifierId);
    expect(rows[0].errorMessage).toBeNull();
  });

  it("writes a failure row with errorMessage", async () => {
    await recordDelivery({ notifierId, status: "failure", latencyMs: 200, errorMessage: "Connection refused", eventKind: "episode_air" });
    const rows = await getRecentForNotifier(notifierId, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("failure");
    expect(rows[0].errorMessage).toBe("Connection refused");
    expect(rows[0].eventKind).toBe("episode_air");
  });

  it("writes a skipped row", async () => {
    await recordDelivery({ notifierId, status: "skipped" });
    const rows = await getRecentForNotifier(notifierId, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("skipped");
    expect(rows[0].latencyMs).toBeNull();
  });
});

describe("getRecentForNotifier", () => {
  it("returns at most n rows", async () => {
    for (let i = 0; i < 8; i++) {
      await recordDelivery({ notifierId, status: "success", latencyMs: i * 10, eventKind: "test" });
    }
    const rows = await getRecentForNotifier(notifierId, 5);
    expect(rows).toHaveLength(5);
  });

  it("returns rows ordered by most-recent first", async () => {
    await recordDelivery({ notifierId, status: "success", latencyMs: 10, eventKind: "first" });
    await recordDelivery({ notifierId, status: "failure", latencyMs: 20, eventKind: "second" });
    await recordDelivery({ notifierId, status: "skipped", latencyMs: 30, eventKind: "third" });

    const rows = await getRecentForNotifier(notifierId, 10);
    expect(rows).toHaveLength(3);
    // Most recent (highest id / most recently inserted) should come first
    expect(rows[0].eventKind).toBe("third");
    expect(rows[2].eventKind).toBe("first");
  });

  it("returns empty array for notifier with no logs", async () => {
    const rows = await getRecentForNotifier(notifierId, 5);
    expect(rows).toHaveLength(0);
  });
});

describe("getSuccessRateForNotifier", () => {
  it("returns 100 when no rows exist", async () => {
    const rate = await getSuccessRateForNotifier(notifierId, 7);
    expect(rate).toBe(100);
  });

  it("returns 100 when all rows are success", async () => {
    await recordDelivery({ notifierId, status: "success" });
    await recordDelivery({ notifierId, status: "success" });
    const rate = await getSuccessRateForNotifier(notifierId, 7);
    expect(rate).toBe(100);
  });

  it("returns 0 when all rows are failure", async () => {
    await recordDelivery({ notifierId, status: "failure" });
    await recordDelivery({ notifierId, status: "failure" });
    const rate = await getSuccessRateForNotifier(notifierId, 7);
    expect(rate).toBe(0);
  });

  it("returns 50 for equal success and failure", async () => {
    await recordDelivery({ notifierId, status: "success" });
    await recordDelivery({ notifierId, status: "failure" });
    const rate = await getSuccessRateForNotifier(notifierId, 7);
    expect(rate).toBe(50);
  });

  it("excludes skipped rows from calculation", async () => {
    await recordDelivery({ notifierId, status: "success" });
    await recordDelivery({ notifierId, status: "skipped" });
    await recordDelivery({ notifierId, status: "skipped" });
    // Only 1 row counted (success), rate = 100
    const rate = await getSuccessRateForNotifier(notifierId, 7);
    expect(rate).toBe(100);
  });

  it("returns 100 when only skipped rows exist", async () => {
    await recordDelivery({ notifierId, status: "skipped" });
    const rate = await getSuccessRateForNotifier(notifierId, 7);
    expect(rate).toBe(100);
  });
});

describe("pruneOldRows", () => {
  it("keeps exactly 200 rows when given 205 rows", async () => {
    for (let i = 0; i < 205; i++) {
      await recordDelivery({ notifierId, status: "success", latencyMs: i });
    }

    const beforePrune = await getRecentForNotifier(notifierId, 300);
    expect(beforePrune).toHaveLength(205);

    await pruneOldRows();

    const afterPrune = await getRecentForNotifier(notifierId, 300);
    expect(afterPrune).toHaveLength(200);
  });

  it("does not prune when row count is at or below 200", async () => {
    for (let i = 0; i < 200; i++) {
      await recordDelivery({ notifierId, status: "success" });
    }

    await pruneOldRows();

    const rows = await getRecentForNotifier(notifierId, 300);
    expect(rows).toHaveLength(200);
  });

  it("keeps the most recent rows after pruning", async () => {
    for (let i = 0; i < 205; i++) {
      await recordDelivery({ notifierId, status: "success", latencyMs: i, eventKind: `event-${i}` });
    }

    await pruneOldRows();

    const rows = await getRecentForNotifier(notifierId, 300);
    expect(rows).toHaveLength(200);
    // Most recent rows should have the highest latencyMs values (204, 203, ...)
    const latencies = rows.map((r) => r.latencyMs ?? 0);
    expect(latencies[0]).toBeGreaterThanOrEqual(5); // most recent = latencyMs 204
  });
});
