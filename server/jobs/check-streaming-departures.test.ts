import { describe, it, expect, beforeEach, afterAll, mock, spyOn } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser } from "../db/repository";
import { getDb } from "../db/schema";
import {
  titles,
  offers,
  providers,
  tracked,
  notifiers,
  streamingAlerts,
  users,
} from "../db/schema";
import { checkStreamingDepartures } from "./check-streaming-departures";
import * as registry from "../notifications/registry";

// ─── Mock notification registry ───────────────────────────────────────────────

const mockSend = mock(async () => {});

// ─── Test helpers ─────────────────────────────────────────────────────────────

async function insertTitle(id: string) {
  const db = getDb();
  await db.insert(titles).values({
    id,
    objectType: "MOVIE",
    title: `Title ${id}`,
    offersChecked: 0,
  }).run();
}

async function insertProvider(id: number, name: string) {
  const db = getDb();
  await db.insert(providers).values({ id, name }).onConflictDoNothing().run();
}

async function insertOffer(titleId: string, providerId: number, monetizationType = "FLATRATE") {
  const db = getDb();
  await db.insert(offers).values({
    titleId,
    providerId,
    monetizationType,
    url: "https://example.com",
  }).run();
}

async function insertTracked(userId: string, titleId: string) {
  const db = getDb();
  await db.insert(tracked).values({ userId, titleId }).run();
}

async function insertArrivalAlert(userId: string, titleId: string, providerId: number, providerName: string) {
  const db = getDb();
  await db.insert(streamingAlerts).values({
    id: crypto.randomUUID(),
    userId,
    titleId,
    providerId,
    providerName,
    kind: "arrival",
  }).run();
}

async function insertNotifier(userId: string) {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.insert(notifiers).values({
    id,
    userId,
    provider: "discord",
    name: "test",
    config: JSON.stringify({ webhookUrl: "https://discord.com/api/webhooks/123/abc" }),
    notifyTime: "09:00",
    timezone: "UTC",
    streamingAlertsEnabled: 1,
  }).run();
  return id;
}

async function getDepartureAlerts(userId: string, titleId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(streamingAlerts)
    .all();
  return rows.filter(
    (r) => r.userId === userId && r.titleId === titleId && r.kind === "departure"
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

let userId: string;
const TITLE_ID = "title-dep-1";
const PROVIDER_ID = 8; // Netflix-like ID
const PROVIDER_NAME = "Netflix";

beforeEach(async () => {
  setupTestDb();
  spyOn(registry, "getProvider").mockReturnValue({ send: mockSend } as any);
  userId = await createUser("depuser", null);
  await insertTitle(TITLE_ID);
  await insertProvider(PROVIDER_ID, PROVIDER_NAME);
  mockSend.mockClear();
});

afterAll(() => {
  teardownTestDb();
});

describe("checkStreamingDepartures", () => {
  it("fires departure alert when offer disappears and arrival alert existed", async () => {
    // Setup: user tracks the title, had an arrival alert, offer is now gone
    await insertTracked(userId, TITLE_ID);
    await insertArrivalAlert(userId, TITLE_ID, PROVIDER_ID, PROVIDER_NAME);
    await insertNotifier(userId);
    // No offer inserted — it has been removed from the DB

    await checkStreamingDepartures([TITLE_ID]);

    // Departure alert should be recorded
    const depAlerts = await getDepartureAlerts(userId, TITLE_ID);
    expect(depAlerts).toHaveLength(1);
    expect(depAlerts[0].kind).toBe("departure");
    expect(depAlerts[0].providerId).toBe(PROVIDER_ID);

    // Notification should have fired
    expect(mockSend).toHaveBeenCalledTimes(1);
    const sentContent = (mockSend.mock.calls[0] as any[])[1] as any;
    expect(sentContent.streamingAlerts[0].kind).toBe("departure");
    expect(sentContent.streamingAlerts[0].providerName).toBe(PROVIDER_NAME);
    expect(sentContent.streamingAlerts[0].title).toBe(`Title ${TITLE_ID}`);
  });

  it("does NOT fire a second departure alert for the same (user, title, provider)", async () => {
    await insertTracked(userId, TITLE_ID);
    await insertArrivalAlert(userId, TITLE_ID, PROVIDER_ID, PROVIDER_NAME);
    await insertNotifier(userId);
    // No offer — already departed

    await checkStreamingDepartures([TITLE_ID]);
    expect(mockSend).toHaveBeenCalledTimes(1);
    mockSend.mockClear();

    // Second run — should be deduped
    await checkStreamingDepartures([TITLE_ID]);
    expect(mockSend).toHaveBeenCalledTimes(0);
  });

  it("does NOT fire when user has streamingDeparturesEnabled = 0", async () => {
    // Disable departures for user
    const db = getDb();
    await db.update(users).set({ streamingDeparturesEnabled: 0 }).run();

    await insertTracked(userId, TITLE_ID);
    await insertArrivalAlert(userId, TITLE_ID, PROVIDER_ID, PROVIDER_NAME);
    await insertNotifier(userId);
    // No offer

    await checkStreamingDepartures([TITLE_ID]);
    expect(mockSend).toHaveBeenCalledTimes(0);

    // No departure alert should be recorded either
    const depAlerts = await getDepartureAlerts(userId, TITLE_ID);
    expect(depAlerts).toHaveLength(0);
  });

  it("does NOT fire departure for a provider that was never tracked (no arrival alert)", async () => {
    // There's an offer from provider 999 that was never in an arrival alert
    await insertProvider(999, "AnotherProvider");
    await insertTracked(userId, TITLE_ID);
    await insertNotifier(userId);
    // No arrival alerts at all

    await checkStreamingDepartures([TITLE_ID]);
    expect(mockSend).toHaveBeenCalledTimes(0);
  });

  it("does NOT fire when the offer is still present", async () => {
    // Offer is still available — no departure
    await insertOffer(TITLE_ID, PROVIDER_ID);
    await insertTracked(userId, TITLE_ID);
    await insertArrivalAlert(userId, TITLE_ID, PROVIDER_ID, PROVIDER_NAME);
    await insertNotifier(userId);

    await checkStreamingDepartures([TITLE_ID]);
    expect(mockSend).toHaveBeenCalledTimes(0);

    const depAlerts = await getDepartureAlerts(userId, TITLE_ID);
    expect(depAlerts).toHaveLength(0);
  });

  it("skips when titleIds is empty", async () => {
    await checkStreamingDepartures([]);
    expect(mockSend).toHaveBeenCalledTimes(0);
  });
});
