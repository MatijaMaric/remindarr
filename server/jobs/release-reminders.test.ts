import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  afterAll,
  mock,
  spyOn,
} from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import {
  upsertTitles,
  trackTitle,
  createUser,
  setRemindOnRelease,
  getTrackedTitles,
  getRecentForNotifier,
} from "../db/repository";
import { createNotifier } from "../db/repository/notifiers";
import * as registry from "../notifications/registry";
import { resetMetrics, renderMetrics } from "../metrics";
import { handleReleaseReminder } from "./release-reminders";

let sendSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  setupTestDb();
  // Spy on the discord provider's send method to avoid real HTTP calls
  const discordProvider = registry.getProvider("discord");
  if (discordProvider) {
    sendSpy = spyOn(discordProvider, "send").mockResolvedValue(
      undefined as any,
    );
    sendSpy.mockClear();
  }
});

afterEach(() => {
  sendSpy?.mockRestore();
});

afterAll(() => {
  teardownTestDb();
});

describe("handleReleaseReminder", () => {
  it("dispatches notification to user's enabled notifiers and clears flag", async () => {
    const userId = await createUser("reminderuser", "hash");
    await upsertTitles([
      makeParsedTitle({ id: "movie-123", title: "Test Movie" }),
    ]);
    await trackTitle("movie-123", userId);
    await setRemindOnRelease("movie-123", userId, true);

    await createNotifier(
      userId,
      "discord",
      "My Discord",
      { webhookUrl: "https://discord.com/api/webhooks/123/abc" },
      "09:00",
      "UTC",
    );

    await handleReleaseReminder({ userId, titleId: "movie-123" });

    expect(sendSpy).toHaveBeenCalledTimes(1);

    const tracked = await getTrackedTitles(userId);
    expect(tracked[0].remind_on_release).toBe(0);
  });

  it("keeps the reminder and rejects when every send fails", async () => {
    const userId = await createUser("reminder-all-fail", "hash");
    await upsertTitles([
      makeParsedTitle({ id: "movie-fail", title: "Fail Movie" }),
    ]);
    await trackTitle("movie-fail", userId);
    await setRemindOnRelease("movie-fail", userId, true);
    const notifierId = await createNotifier(
      userId,
      "discord",
      "My Discord",
      { webhookUrl: "https://discord.com/api/webhooks/123/abc" },
      "09:00",
      "UTC",
    );
    sendSpy.mockRejectedValue(new Error("webhook down"));
    resetMetrics();

    await expect(
      handleReleaseReminder({ userId, titleId: "movie-fail" }),
    ).rejects.toThrow("All release reminder sends failed");

    const tracked = await getTrackedTitles(userId);
    expect(tracked[0].remind_on_release).toBe(1);
    const rows = await getRecentForNotifier(notifierId, 5);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("failure");
    expect(rows[0].eventKind).toBe("release_reminder");
    expect(rows[0].errorMessage).toBe("webhook down");
    expect(renderMetrics()).toContain(
      'notifications_sent_total{kind="release_reminder",outcome="failure",provider="discord"} 1',
    );
  });

  it("clears the reminder when one provider succeeds", async () => {
    const userId = await createUser("reminder-partial", "hash");
    await upsertTitles([
      makeParsedTitle({ id: "movie-partial", title: "Partial Movie" }),
    ]);
    await trackTitle("movie-partial", userId);
    await setRemindOnRelease("movie-partial", userId, true);
    const discordId = await createNotifier(
      userId,
      "discord",
      "My Discord",
      { webhookUrl: "https://discord.com/api/webhooks/123/abc" },
      "09:00",
      "UTC",
    );
    const ntfyId = await createNotifier(
      userId,
      "ntfy",
      "My Ntfy",
      { url: "https://ntfy.sh", topic: "remindarr" },
      "09:00",
      "UTC",
    );
    const ntfy = registry.getProvider("ntfy");
    const ntfySpy = spyOn(ntfy!, "send").mockRejectedValue(
      new Error("ntfy down"),
    );

    try {
      await handleReleaseReminder({ userId, titleId: "movie-partial" });

      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(ntfySpy).toHaveBeenCalledTimes(1);
      const tracked = await getTrackedTitles(userId);
      expect(tracked[0].remind_on_release).toBe(0);
      expect((await getRecentForNotifier(discordId, 5))[0].status).toBe(
        "success",
      );
      expect((await getRecentForNotifier(ntfyId, 5))[0].status).toBe("failure");
    } finally {
      ntfySpy.mockRestore();
    }
  });

  it("handles unknown userId gracefully without throwing", async () => {
    // Should not throw
    await expect(
      handleReleaseReminder({
        userId: "nonexistent-user",
        titleId: "movie-123",
      }),
    ).resolves.toBeUndefined();
  });

  it("handles unknown titleId gracefully without throwing", async () => {
    const userId = await createUser("reminderuser2", "hash");
    // Should not throw
    await expect(
      handleReleaseReminder({ userId, titleId: "nonexistent-title" }),
    ).resolves.toBeUndefined();
  });

  it("logs error and returns if required fields are missing", async () => {
    // Should not throw
    await expect(handleReleaseReminder({})).resolves.toBeUndefined();
  });

  it("skips dispatch when user has no enabled notifiers", async () => {
    const userId = await createUser("reminderuser3", "hash");
    await upsertTitles([
      makeParsedTitle({ id: "movie-456", title: "Another Movie" }),
    ]);
    await trackTitle("movie-456", userId);
    await setRemindOnRelease("movie-456", userId, true);

    await handleReleaseReminder({ userId, titleId: "movie-456" });

    expect(sendSpy).not.toHaveBeenCalled();
  });
});
