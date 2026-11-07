import {
  afterEach,
  beforeEach,
  expect,
  setSystemTime,
  spyOn,
  test,
} from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { CONFIG } from "../config";
import { createNotifier, createUser, getNotifierById } from "../db/repository";
import * as content from "./content";
import * as time from "../jobs/time-utils";
import { registerNotificationJobs } from "../jobs/notifications";
import { getHandler } from "../jobs/worker";
import { handlers } from "../jobs/processor";
import {
  getLibrarySections,
  PlexAuthError,
  PlexApiError,
} from "../plex/client";

const savedOrigins = CONFIG.OUTBOUND_PRIVATE_ORIGINS;
const spies: { mockRestore(): void }[] = [];
let receiver: ReturnType<typeof Bun.serve>;
let status = 204;
let received: { path: string; body: string; token: string | null }[];
let origin: string;

beforeEach(() => {
  setupTestDb();
  status = 204;
  received = [];
  receiver = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      received.push({
        path: new URL(request.url).pathname,
        body: await request.text(),
        token: request.headers.get("X-Plex-Token"),
      });
      if (status !== 200) return new Response(null, { status });
      return Response.json({
        MediaContainer: {
          Directory: [{ key: "1", type: "movie", title: "Synthetic library" }],
        },
      });
    },
  });
  origin = `http://127.0.0.1:${receiver.port}`;
  CONFIG.OUTBOUND_PRIVATE_ORIGINS = origin;
});

afterEach(() => {
  receiver.stop(true);
  for (const spy of spies.splice(0)) spy.mockRestore();
  CONFIG.OUTBOUND_PRIVATE_ORIGINS = savedOrigins;
  teardownTestDb();
});

for (const runtime of ["Bun", "portable"] as const) {
  for (const mode of ["daily", "weekly", "off"] as const) {
    test(`${runtime} scheduled ${mode} delivery reaches an HTTP receiver and recovers from an outage`, async () => {
      const now = { time: "09:00", date: "2026-10-03", dayOfWeek: 6 };
      spies.push(spyOn(time, "getCurrentTimeInTimezone").mockReturnValue(now));
      const payload = {
        date: now.date,
        episodes: [],
        movies: [
          {
            title: "Synthetic release",
            releaseYear: 2026,
            posterUrl: null,
            offers: [],
          },
        ],
      };
      spies.push(
        spyOn(content, "buildNotificationContent").mockResolvedValue(payload),
      );
      spies.push(
        spyOn(content, "buildWeeklyDigestContent").mockResolvedValue(payload),
      );
      const user = await createUser("delivery_test", "unused-test-hash");
      const id = await createNotifier(
        user,
        "webhook",
        "Controlled receiver",
        { url: `${origin}/hook` },
        "09:00",
        "Pacific/Auckland",
        mode,
        6,
      );
      await registerNotificationJobs();
      const run = () =>
        runtime === "Bun"
          ? getHandler("send-notifications")!({} as never)
          : handlers["send-notifications"](null);
      status = 503;
      await run();
      if (mode === "off") {
        expect(received).toHaveLength(0);
        return;
      }
      expect(received).toHaveLength(1);
      expect((await getNotifierById(id, user))?.last_sent_date).toBeNull();
      status = 204;
      await run();
      expect(received).toHaveLength(2);
      expect(JSON.parse(received[1].body).movies[0].title).toBe(
        "Synthetic release",
      );
      expect((await getNotifierById(id, user))?.last_sent_date).toBe(now.date);
      await run();
      expect(received).toHaveLength(2);
    });
  }
}

test("real clock: only the notifier whose local time has reached notify_time is delivered", async () => {
  // 2026-10-02T20:00Z = 09:00 Sat in Auckland (NZDT, UTC+13) and
  // 13:00 Fri in Los Angeles (PDT, UTC-7), before its 14:00 slot.
  // No spy on the time utils.
  setSystemTime(new Date("2026-10-02T20:00:00Z"));
  try {
    const payload = {
      date: "",
      episodes: [],
      movies: [
        { title: "TZ release", releaseYear: 2026, posterUrl: null, offers: [] },
      ],
    };
    spies.push(
      spyOn(content, "buildNotificationContent").mockResolvedValue(payload),
    );
    const user = await createUser("tz_test", "unused-test-hash");
    const make = (path: string, tz: string, time: string) =>
      createNotifier(
        user,
        "webhook",
        tz,
        { url: `${origin}${path}` },
        time,
        tz,
        "daily",
      );
    const nz = await make("/nz", "Pacific/Auckland", "09:00");
    const la = await make("/la", "America/Los_Angeles", "14:00");
    await registerNotificationJobs();
    await getHandler("send-notifications")!({} as never);

    expect(received.map((r) => r.path)).toEqual(["/nz"]);
    expect((await getNotifierById(nz, user))?.last_sent_date).toBe(
      "2026-10-03",
    );
    expect((await getNotifierById(la, user))?.last_sent_date).toBeNull();
  } finally {
    setSystemTime();
  }
});

test("an operator-approved Plex receiver rejects expired credentials, survives unavailability and recovers", async () => {
  status = 401;
  await expect(
    getLibrarySections(origin, "disposable-token"),
  ).rejects.toBeInstanceOf(PlexAuthError);
  status = 503;
  await expect(
    getLibrarySections(origin, "disposable-token"),
  ).rejects.toBeInstanceOf(PlexApiError);
  status = 200;
  expect(await getLibrarySections(origin, "disposable-token")).toEqual([
    { key: "1", type: "movie", title: "Synthetic library" },
  ]);
  expect(
    received.every(
      (request) =>
        request.path === "/library/sections" &&
        request.token === "disposable-token",
    ),
  ).toBe(true);
});
