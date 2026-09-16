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
import { makeParsedOffer, makeParsedTitle } from "../test-utils/fixtures";
import { getDb, jobs, notificationLog, notifiers } from "../db/schema";
import {
  createNotifier,
  createUser,
  trackTitle,
  upsertTitles,
} from "../db/repository";
import * as timeUtils from "./time-utils";
import * as registry from "../notifications/registry";
import * as content from "../notifications/content";
import { handlers, processPendingJobs } from "./processor";
import { checkStreamingAlerts } from "./check-streaming-alerts";

const currentTime = timeUtils.getCurrentTimeInTimezone;
const localDate = "2026-09-17"; // Thursday in Auckland, Wednesday in UTC.
let spies: ReturnType<typeof spyOn>[] = [];
let userId: string;
let send: ReturnType<typeof mock>;

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("cf-digest", "hash");
  send = mock(async () => {});
  spies.push(
    spyOn(timeUtils, "getCurrentTimeInTimezone").mockImplementation((tz) =>
      currentTime(tz, new Date("2026-09-16T21:05:00Z")),
    ),
    spyOn(registry, "getProvider").mockReturnValue({
      name: "discord",
      send,
      validateConfig: () => ({ valid: true }),
    }),
  );
  for (const date of ["2026-09-16", localDate, "2026-09-23", "2026-09-24"]) {
    const id = `movie-${date}`;
    await upsertTitles([
      makeParsedTitle({
        id,
        title: date,
        releaseDate: date,
        offers: [makeParsedOffer({ titleId: id })],
      }),
    ]);
    await trackTitle(id, userId);
  }
});

afterEach(() => {
  spies.forEach((spy) => spy.mockRestore());
  spies = [];
  teardownTestDb();
});

for (const execution of ["D1 queue", "DO shared handler"] as const) {
  describe(`Cloudflare digest modes (${execution})`, () => {
    async function dispatch() {
      if (execution === "DO shared handler") {
        await handlers["send-notifications"](null);
      } else {
        await getDb().insert(jobs).values({
          name: "send-notifications",
          runAt: new Date().toISOString(),
        });
        expect(await processPendingJobs()).toBe(1);
      }
    }

    async function notifier(mode: string | null, day: number | null = null) {
      return createNotifier(
        userId,
        "discord",
        "Digest",
        {},
        "09:03",
        "Pacific/Auckland",
        mode,
        day,
      );
    }

    for (const mode of ["daily", null]) {
      it(`keeps ${mode ?? "default"} digests limited to the local date`, async () => {
        await notifier(mode);
        await dispatch();
        expect(send).toHaveBeenCalledTimes(1);
        expect(
          send.mock.calls[0][1].movies.map(
            (movie: { title: string }) => movie.title,
          ),
        ).toEqual([localDate]);
        expect(
          (await getDb().select().from(notificationLog).all())[0].eventKind,
        ).toBe("episode_air");
      });
    }

    it("sends and caches seven-day content on the configured local weekday", async () => {
      const weekly = spyOn(content, "buildWeeklyDigestContent");
      spies.push(weekly);
      await notifier("weekly", 4);
      await notifier("weekly", 4);
      await dispatch();
      expect(weekly).toHaveBeenCalledTimes(1);
      expect(weekly).toHaveBeenCalledWith(userId, localDate, "2026-09-24");
      expect(send).toHaveBeenCalledTimes(2);
      expect(
        send.mock.calls[0][1].movies
          .map((movie: { title: string }) => movie.title)
          .sort(),
      ).toEqual([localDate, "2026-09-23"]);
      expect(
        (await getDb().select().from(notificationLog).all()).every(
          (entry) => entry.eventKind === "digest",
        ),
      ).toBe(true);
      await dispatch();
      expect(send).toHaveBeenCalledTimes(2);
    });

    it("skips weekly digests on other local weekdays", async () => {
      await notifier("weekly", 0);
      await dispatch();
      expect(send).not.toHaveBeenCalled();
    });

    it("keeps separately enabled streaming alerts when scheduled digests are off", async () => {
      const id = await notifier("off");
      await dispatch();
      expect(send).not.toHaveBeenCalled();
      expect(
        (
          await getDb()
            .select()
            .from(notifiers)
            .where(eq(notifiers.id, id))
            .get()
        )?.enabled,
      ).toBe(1);
      await checkStreamingAlerts([`movie-${localDate}`]);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][1].streamingAlerts[0].kind).toBe("arrival");
    });
  });
}
