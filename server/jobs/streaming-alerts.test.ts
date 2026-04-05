import { describe, it, expect, beforeEach, afterEach, afterAll, mock, spyOn } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import {
  createUser,
  upsertTitles,
  trackTitle,
  createNotifier,
  getUnalertedProviders,
} from "../db/repository";
import { makeParsedTitle, makeParsedOffer } from "../test-utils/fixtures";

// We import the internals we need to test. Since checkStreamingAlerts is not
// exported, we test it indirectly via getUnalertedProviders state changes and
// by verifying that the notification provider send() is called.
import * as registry from "../notifications/registry";

let userId: string;
const TITLE_ID = "movie-streaming-test";
const PROVIDER_ID = 8;
const PROVIDER_NAME = "Netflix";
let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("streamalertuser", "hash");
});

afterEach(() => {
  spies.forEach((s) => s.mockRestore());
  spies = [];
});

afterAll(() => {
  teardownTestDb();
});

describe("getStreamingAlertNotifiersForUser", () => {
  it("returns notifiers with streaming_alerts_enabled=true", async () => {
    const { getStreamingAlertNotifiersForUser } = await import("../db/repository/notifiers");
    await createNotifier(userId, "discord", "Discord", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");
    const notifiers = await getStreamingAlertNotifiersForUser(userId);
    expect(notifiers).toHaveLength(1);
    expect(notifiers[0].provider).toBe("discord");
  });

  it("excludes notifiers with streaming_alerts_enabled=false", async () => {
    const { getStreamingAlertNotifiersForUser } = await import("../db/repository/notifiers");
    const id = await createNotifier(userId, "discord", "Discord", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");
    // Update to disable streaming alerts
    const { updateNotifier } = await import("../db/repository/notifiers");
    await updateNotifier(id, userId, { streamingAlertsEnabled: false });
    const notifiers = await getStreamingAlertNotifiersForUser(userId);
    expect(notifiers).toHaveLength(0);
  });

  it("excludes disabled notifiers", async () => {
    const { getStreamingAlertNotifiersForUser } = await import("../db/repository/notifiers");
    const id = await createNotifier(userId, "discord", "Discord", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");
    const { updateNotifier } = await import("../db/repository/notifiers");
    await updateNotifier(id, userId, { enabled: false });
    const notifiers = await getStreamingAlertNotifiersForUser(userId);
    expect(notifiers).toHaveLength(0);
  });
});

describe("streaming alert flow via sync", () => {
  it("marks providers as alerted after sync and does not re-alert on next sync", async () => {
    // Set up a title with a flatrate offer
    await upsertTitles([
      makeParsedTitle({
        id: TITLE_ID,
        title: "New on Netflix",
        offers: [
          makeParsedOffer({
            titleId: TITLE_ID,
            providerId: PROVIDER_ID,
            providerName: PROVIDER_NAME,
            monetizationType: "FLATRATE",
          }),
        ],
      }),
    ]);

    // User tracks the title
    await trackTitle(TITLE_ID, userId);

    // User has a notifier with streaming alerts enabled
    const sendFn = mock(async () => {});
    spies.push(spyOn(registry, "getProvider").mockReturnValue({
      name: "discord",
      send: sendFn,
      validateConfig: () => ({ valid: true }),
    } as any));

    await createNotifier(userId, "discord", "Discord", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");

    // Simulate what checkStreamingAlerts does by importing and calling it
    // We use the internal module directly for white-box testing
    const { checkStreamingAlerts } = await import("./check-streaming-alerts");
    await checkStreamingAlerts([TITLE_ID]);

    // Verify send was called once
    expect(sendFn).toHaveBeenCalledTimes(1);
    const content = (sendFn.mock.calls[0] as any[])[1] as any;
    expect(content.streamingAlerts).toHaveLength(1);
    expect(content.streamingAlerts[0].providerName).toBe(PROVIDER_NAME);

    // After alerting, the provider should be marked
    const unalerted = await getUnalertedProviders(userId, TITLE_ID, [PROVIDER_ID]);
    expect(unalerted).toEqual([]);

    // Second call should NOT send again
    sendFn.mockClear();
    await checkStreamingAlerts([TITLE_ID]);
    expect(sendFn).toHaveBeenCalledTimes(0);
  });

  it("does not alert when title has no flatrate/free offers", async () => {
    await upsertTitles([
      makeParsedTitle({
        id: TITLE_ID,
        title: "Rental Only",
        offers: [
          makeParsedOffer({
            titleId: TITLE_ID,
            providerId: PROVIDER_ID,
            providerName: PROVIDER_NAME,
            monetizationType: "RENT",
          }),
        ],
      }),
    ]);

    await trackTitle(TITLE_ID, userId);

    const sendFn = mock(async () => {});
    spies.push(spyOn(registry, "getProvider").mockReturnValue({
      name: "discord",
      send: sendFn,
      validateConfig: () => ({ valid: true }),
    } as any));

    await createNotifier(userId, "discord", "Discord", { webhookUrl: "https://discord.com/api/webhooks/1/a" }, "09:00", "UTC");

    const { checkStreamingAlerts } = await import("./check-streaming-alerts");
    await checkStreamingAlerts([TITLE_ID]);

    expect(sendFn).toHaveBeenCalledTimes(0);
  });
});
