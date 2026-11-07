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
import { getDb, users } from "../db/schema";
import {
  createNotifier,
  createUser,
  setRemindOnRelease,
  trackTitle,
  upsertTitles,
} from "../db/repository";
import * as timeUtils from "./time-utils";
import * as registry from "../notifications/registry";
import { handlers } from "./processor";
import { checkStreamingAlerts } from "./check-streaming-alerts";
import { handleReleaseReminder } from "./release-reminders";
import type { NotificationContent } from "../notifications/types";

// Dispatch paths must hand each provider the recipient's saved UI language
// (users.locale) so notification text is rendered in that language.

const currentTime = timeUtils.getCurrentTimeInTimezone;
const localDate = "2026-09-17"; // Auckland date at the mocked instant
const movieId = `movie-${localDate}`;
let spies: ReturnType<typeof spyOn>[] = [];
let userId: string;
let send: ReturnType<typeof mock>;

async function setLocale(id: string, locale: string | null) {
  await getDb().update(users).set({ locale }).where(eq(users.id, id)).run();
}

function sentContent(call = 0): NotificationContent {
  return send.mock.calls[call][1] as NotificationContent;
}

async function notifier(
  mode: string | null = "daily",
  day: number | null = null,
) {
  return createNotifier(
    userId,
    "discord",
    "Locale",
    {},
    "09:03",
    "Pacific/Auckland",
    mode,
    day,
  );
}

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("locale-user", "hash");
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
  await upsertTitles([
    makeParsedTitle({
      id: movieId,
      title: "Locale Movie",
      releaseDate: localDate,
      offers: [makeParsedOffer({ titleId: movieId })],
    }),
  ]);
  await trackTitle(movieId, userId);
});

afterEach(() => {
  spies.forEach((spy) => spy.mockRestore());
  spies = [];
  teardownTestDb();
});

describe("notification dispatch locale", () => {
  it("passes the user's locale to the provider for daily notifications", async () => {
    await setLocale(userId, "pt-BR");
    await notifier("daily");
    await handlers["send-notifications"](null);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sentContent().locale).toBe("pt-BR");
  });

  it("passes the user's locale for weekly digests", async () => {
    await setLocale(userId, "ja");
    await notifier("weekly", 4); // Thursday in Auckland
    await handlers["send-notifications"](null);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sentContent().locale).toBe("ja");
  });

  it("leaves locale unset (English) when the user has none", async () => {
    await notifier("daily");
    await handlers["send-notifications"](null);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sentContent().locale).toBeUndefined();
  });

  it("passes the user's locale for release reminders", async () => {
    await setLocale(userId, "fr");
    await setRemindOnRelease(movieId, userId, true);
    await notifier("daily");
    await handleReleaseReminder({ userId, titleId: movieId });
    expect(send).toHaveBeenCalledTimes(1);
    expect(sentContent().locale).toBe("fr");
  });

  it("passes the user's locale for streaming arrival alerts", async () => {
    await setLocale(userId, "de");
    await notifier("off");
    await checkStreamingAlerts([movieId]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sentContent().streamingAlerts?.[0].kind).toBe("arrival");
    expect(sentContent().locale).toBe("de");
  });
});
