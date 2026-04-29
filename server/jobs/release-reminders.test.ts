import { describe, it, expect, beforeEach, afterAll, mock, spyOn } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import { upsertTitles, trackTitle, createUser, setRemindOnRelease } from "../db/repository";
import { createNotifier } from "../db/repository/notifiers";
import * as registry from "../notifications/registry";
import { handleReleaseReminder } from "./release-reminders";

let sendSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  setupTestDb();
  // Spy on the discord provider's send method to avoid real HTTP calls
  const discordProvider = registry.getProvider("discord");
  if (discordProvider) {
    sendSpy = spyOn(discordProvider, "send").mockResolvedValue(undefined as any);
    sendSpy.mockClear();
  }
});

afterAll(() => {
  teardownTestDb();
});

describe("handleReleaseReminder", () => {
  it("dispatches notification to user's enabled notifiers and clears flag", async () => {
    const userId = await createUser("reminderuser", "hash");
    await upsertTitles([makeParsedTitle({ id: "movie-123", title: "Test Movie" })]);
    await trackTitle("movie-123", userId);
    await setRemindOnRelease("movie-123", userId, true);

    await createNotifier(
      userId,
      "discord",
      "My Discord",
      { webhookUrl: "https://discord.com/api/webhooks/123/abc" },
      "09:00",
      "UTC"
    );

    await handleReleaseReminder({ userId, titleId: "movie-123" });

    expect(sendSpy).toHaveBeenCalledTimes(1);

    // Verify flag was cleared
    const { getTrackedTitles } = await import("../db/repository");
    const tracked = await getTrackedTitles(userId);
    expect(tracked[0].remind_on_release).toBe(0);
  });

  it("handles unknown userId gracefully without throwing", async () => {
    // Should not throw
    await expect(handleReleaseReminder({ userId: "nonexistent-user", titleId: "movie-123" })).resolves.toBeUndefined();
  });

  it("handles unknown titleId gracefully without throwing", async () => {
    const userId = await createUser("reminderuser2", "hash");
    // Should not throw
    await expect(handleReleaseReminder({ userId, titleId: "nonexistent-title" })).resolves.toBeUndefined();
  });

  it("logs error and returns if required fields are missing", async () => {
    // Should not throw
    await expect(handleReleaseReminder({})).resolves.toBeUndefined();
  });

  it("skips dispatch when user has no enabled notifiers", async () => {
    const userId = await createUser("reminderuser3", "hash");
    await upsertTitles([makeParsedTitle({ id: "movie-456", title: "Another Movie" })]);
    await trackTitle("movie-456", userId);
    await setRemindOnRelease("movie-456", userId, true);

    await handleReleaseReminder({ userId, titleId: "movie-456" });

    expect(sendSpy).not.toHaveBeenCalled();
  });
});
