import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { eq } from "drizzle-orm";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle, makeParsedOffer } from "../test-utils/fixtures";
import { CONFIG } from "../config";
import { getDb, jobs, notifiers, users, providers } from "../db/schema";
import {
  createUser,
  createNotifier,
  upsertTitles,
  trackTitle,
  markNotifierSent,
  getDueNotifiers,
  getUnalertedProviders,
  setRemindOnRelease,
  markAlerted,
} from "../db/repository";
import {
  armCron,
  enqueueAdhoc,
  cancelReleaseReminder,
  runWithEnv,
} from "./backend";
import { handlers, processPendingJobs } from "./processor";
import { checkStreamingAlerts } from "./check-streaming-alerts";
import { checkStreamingDepartures } from "./check-streaming-departures";
import { getCurrentTimeInTimezone } from "./time-utils";
import * as registry from "../notifications/registry";
import * as content from "../notifications/content";

const env = { DB: {} as D1Database };
const originalBackend = CONFIG.JOB_QUEUE_BACKEND;
let userId: string;
let spies: ReturnType<typeof spyOn>[] = [];
beforeEach(async () => {
  setupTestDb();
  CONFIG.JOB_QUEUE_BACKEND = "d1";
  userId = await createUser("recovery", "hash");
});
afterEach(() => {
  spies.forEach((spy) => spy.mockRestore());
  spies = [];
  CONFIG.JOB_QUEUE_BACKEND = originalBackend;
  teardownTestDb();
});

describe("D1 watchdog schedules", () => {
  it("runs a daily cron only when due and catches up after a missed tick", async () => {
    const arm = (time: string) =>
      armCron(env, "sync-titles", "0 3 * * *", new Date(time));
    await arm("2026-09-16T02:55:00Z");
    expect(await getDb().select().from(jobs).all()).toHaveLength(0);
    await Promise.all([
      arm("2026-09-16T03:10:00Z"),
      arm("2026-09-16T03:10:00Z"),
    ]);
    expect(await getDb().select().from(jobs).all()).toHaveLength(1);
    await getDb().update(jobs).set({ status: "completed" });
    await arm("2026-09-16T03:15:00Z");
    await arm("2026-09-16T23:55:00Z");
    expect(await getDb().select().from(jobs).all()).toHaveLength(1);
    await arm("2026-09-17T03:00:00Z");
    expect(await getDb().select().from(jobs).all()).toHaveLength(2);
  });
});

describe("notifier due windows", () => {
  for (const runtime of ["Bun", "Cloudflare"])
    it(`${runtime} delivers 09:03 on the first later tick, retries failure, and deduplicates success`, async () => {
      const dispatch = async () => {
        if (runtime === "Cloudflare")
          return handlers["send-notifications"](null);
        const { registerNotificationJobs } = await import("./notifications");
        const { processJobs } = await import("./worker");
        await registerNotificationJobs();
        await enqueueAdhoc("send-notifications");
        await processJobs();
      };
      const id = await createNotifier(
        userId,
        "discord",
        "Morning",
        {},
        "09:03",
        "UTC",
      );
      let now = new Date("2026-09-16T09:00:00Z");
      const clock = await import("./time-utils");
      spies.push(
        spyOn(clock, "getCurrentTimeInTimezone").mockImplementation((tz) =>
          getCurrentTimeInTimezoneOriginal(tz, now),
        ),
      );
      const send = mock(async () => {});
      send.mockRejectedValueOnce(new Error("503"));
      spies.push(
        spyOn(registry, "getProvider").mockReturnValue({
          name: "discord",
          send,
          validateConfig: () => ({ valid: true }),
        }),
      );
      spies.push(
        spyOn(content, "buildNotificationContent").mockResolvedValue({
          episodes: [],
          movies: [
            { title: "Due", releaseYear: 2026, posterUrl: null, offers: [] },
          ],
          date: "2026-09-16",
        }),
      );
      await dispatch();
      expect(send).not.toHaveBeenCalled();
      now = new Date("2026-09-16T09:05:00Z");
      await dispatch();
      expect(
        (
          await getDb()
            .select()
            .from(notifiers)
            .where(eq(notifiers.id, id))
            .get()
        )?.lastSentDate,
      ).toBeNull();
      now = new Date("2026-09-16T11:15:00Z");
      await dispatch();
      await dispatch();
      expect(send).toHaveBeenCalledTimes(2);
    });

  it("uses local dates, weekly days and quiet hours, including midnight and DST", async () => {
    const id = await createNotifier(
      userId,
      "discord",
      "Local",
      {},
      "09:03",
      "Pacific/Auckland",
    );
    const due = (iso: string) =>
      getDueNotifiers(
        new Map([
          [
            "Pacific/Auckland",
            getCurrentTimeInTimezone("Pacific/Auckland", new Date(iso)),
          ],
        ]),
      );
    expect(await due("2026-09-16T21:05:00Z")).toHaveLength(1); // Sep 17 locally
    await markNotifierSent(id, "2026-09-17");
    expect(await due("2026-09-16T21:30:00Z")).toHaveLength(0);
    expect(await due("2026-09-17T12:05:00Z")).toHaveLength(0); // next day, before time
    await getDb()
      .update(notifiers)
      .set({
        digestMode: "weekly",
        digestDay: 5,
        quietHoursStart: "08:00",
        quietHoursEnd: "10:00",
      })
      .where(eq(notifiers.id, id));
    expect(await due("2026-09-17T21:05:00Z")).toHaveLength(0); // Friday, quiet
    expect(await due("2026-09-17T22:05:00Z")).toHaveLength(1);
    expect(await due("2026-09-18T22:05:00Z")).toHaveLength(0); // Saturday
    await getDb()
      .update(notifiers)
      .set({
        digestMode: "daily",
        quietHoursStart: "23:00",
        quietHoursEnd: "08:00",
        notifyTime: "00:03",
      })
      .where(eq(notifiers.id, id));
    expect(await due("2026-09-27T11:05:00Z")).toHaveLength(0); // NZ DST, midnight quiet
    expect(await due("2026-09-27T19:05:00Z")).toHaveLength(1);
    await getDb()
      .update(notifiers)
      .set({ digestMode: "off" })
      .where(eq(notifiers.id, id));
    expect(await due("2026-09-27T19:05:00Z")).toHaveLength(0);
  });

  it("defers a weekly notification across midnight without losing its scheduled date", async () => {
    const id = await createNotifier(
      userId,
      "discord",
      "Late digest",
      {},
      "23:03",
      "UTC",
    );
    await getDb()
      .update(notifiers)
      .set({
        digestMode: "weekly",
        digestDay: 3,
        quietHoursStart: "23:00",
        quietHoursEnd: "08:00",
      })
      .where(eq(notifiers.id, id));
    const due = (iso: string) =>
      getDueNotifiers(
        new Map([["UTC", getCurrentTimeInTimezone("UTC", new Date(iso))]]),
      );
    expect(await due("2026-09-16T23:05:00Z")).toHaveLength(0);
    expect(await due("2026-09-17T07:55:00Z")).toHaveLength(0);
    const resumed = await due("2026-09-17T08:05:00Z");
    expect(resumed).toHaveLength(1);
    expect(resumed[0].todayDate).toBe("2026-09-16");
    await markNotifierSent(id, resumed[0].todayDate);
    expect(await due("2026-09-17T08:10:00Z")).toHaveLength(0);
  });
});
const getCurrentTimeInTimezoneOriginal = getCurrentTimeInTimezone;

describe("release reminders", () => {
  it("executes the portable handler in D1, honors delay, cancellation and duplicate completion", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-42" })]);
    await trackTitle("movie-42", userId);
    await setRemindOnRelease("movie-42", userId, true);
    await createNotifier(userId, "discord", "Reminder", {}, "09:00", "UTC");
    const send = mock(async () => {});
    spies.push(
      spyOn(registry, "getProvider").mockReturnValue({
        name: "discord",
        send,
        validateConfig: () => ({ valid: true }),
      }),
    );
    const data = { userId, titleId: "movie-42" };
    await enqueueAdhoc("release-reminder", data, {
      runAt: new Date(Date.now() + 86_400_000),
    });
    expect(await processPendingJobs()).toBe(0);
    await cancelReleaseReminder(userId, data.titleId);
    expect(await getDb().select().from(jobs).all()).toHaveLength(0);
    await enqueueAdhoc("release-reminder", data);
    expect(await processPendingJobs()).toBe(1);
    await enqueueAdhoc("release-reminder", data);
    await processPendingJobs();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("routes delayed creation and scoped cancellation to the active DO without D1 insertion", async () => {
    CONFIG.JOB_QUEUE_BACKEND = "durable-object";
    const calls: { path: string; body: any }[] = [];
    const namespace = {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async (req: Request) => {
          calls.push({
            path: new URL(req.url).pathname,
            body: await req.json(),
          });
          return Response.json({ ok: true });
        },
      }),
    } as unknown as DurableObjectNamespace;
    const runAt = new Date(Date.now() + 86_400_000);
    await runWithEnv({ ...env, JOB_QUEUE_DO: namespace }, async () => {
      await enqueueAdhoc(
        "release-reminder",
        { userId, titleId: "movie-42" },
        { runAt },
      );
      await cancelReleaseReminder(userId, "movie-42");
    });
    expect(calls.map((call) => call.path)).toEqual([
      "/enqueue",
      "/cancel-reminder",
    ]);
    expect(calls[0].body.runAt).toBe(runAt.toISOString());
    expect(calls[1].body).toEqual({ userId, titleId: "movie-42" });
    expect(await getDb().select().from(jobs).all()).toHaveLength(0);
  });
});

for (const kind of ["arrival", "departure"] as const) {
  it(`${kind} retries only failed destinations, preserving the no-notifier policy`, async () => {
    const titleId = "movie-recovery";
    await getDb()
      .insert(providers)
      .values({ id: 8, name: "Netflix" })
      .onConflictDoNothing();
    await upsertTitles([
      makeParsedTitle({
        id: titleId,
        offers:
          kind === "arrival"
            ? [
                makeParsedOffer({
                  titleId,
                  providerId: 8,
                  providerName: "Netflix",
                  monetizationType: "FLATRATE",
                }),
              ]
            : [],
      }),
    ]);
    await trackTitle(titleId, userId);
    await getDb()
      .update(users)
      .set({ streamingDeparturesEnabled: 1 })
      .where(eq(users.id, userId));
    if (kind === "departure")
      await markAlerted(userId, titleId, 8, "Netflix", "arrival");
    await createNotifier(
      userId,
      "discord",
      "Good",
      { destination: "good" },
      "09:00",
      "UTC",
    );
    await createNotifier(
      userId,
      "discord",
      "Retry",
      { destination: "retry" },
      "09:00",
      "UTC",
    );
    let fails = true;
    const sends: string[] = [];
    spies.push(
      spyOn(registry, "getProvider").mockReturnValue({
        name: "discord",
        validateConfig: () => ({ valid: true }),
        send: async (config) => {
          sends.push(config.destination);
          if (fails && config.destination === "retry") throw new Error("503");
        },
      }),
    );
    const check =
      kind === "arrival" ? checkStreamingAlerts : checkStreamingDepartures;
    await check([titleId]);
    expect(await getUnalertedProviders(userId, titleId, [8], kind)).toEqual([
      8,
    ]);
    fails = false;
    await check([titleId]);
    await check([titleId]);
    expect(sends).toEqual(["good", "retry", "retry"]);
    expect(await getUnalertedProviders(userId, titleId, [8], kind)).toEqual([]);
    const noNotifierUser = await createUser("no-destination", "hash");
    await trackTitle(titleId, noNotifierUser);
    await getDb()
      .update(users)
      .set({ streamingDeparturesEnabled: 1 })
      .where(eq(users.id, noNotifierUser));
    if (kind === "departure")
      await markAlerted(noNotifierUser, titleId, 8, "Netflix", "arrival");
    await check([titleId]);
    expect(
      await getUnalertedProviders(noNotifierUser, titleId, [8], kind),
    ).toEqual([]);
  });
}
