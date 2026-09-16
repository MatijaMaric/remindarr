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
import { CONFIG } from "../config";
import { getDb, jobs, users } from "../db/schema";
import * as repository from "../db/repository";
import * as syncTitles from "../tmdb/sync-titles";
import * as arrivals from "./check-streaming-alerts";
import * as departures from "./check-streaming-departures";
import * as registry from "../notifications/registry";
import { handlers, processPendingJobs } from "./processor";

const originalApiKey = CONFIG.TMDB_API_KEY;
let spies: ReturnType<typeof spyOn>[] = [];
let userId: string;
const titleId = "movie-123";

beforeEach(async () => {
  setupTestDb();
  CONFIG.TMDB_API_KEY = "test-key";
  userId = await repository.createUser("cf-streaming", "hash");
  await repository.upsertTitles([makeParsedTitle()]);
  await repository.trackTitle(titleId, userId);
  await getDb()
    .update(users)
    .set({ streamingDeparturesEnabled: 1 })
    .where(eq(users.id, userId));
  await repository.createNotifier(
    userId,
    "discord",
    "Streaming",
    {},
    "09:00",
    "UTC",
  );
});

afterEach(() => {
  spies.forEach((spy) => spy.mockRestore());
  spies = [];
  CONFIG.TMDB_API_KEY = originalApiKey;
  teardownTestDb();
});

for (const execution of ["D1 queue", "DO shared handler"] as const) {
  describe(`Cloudflare title sync (${execution})`, () => {
    async function dispatch() {
      if (execution === "DO shared handler") {
        await handlers["sync-titles"](null);
      } else {
        await getDb()
          .insert(jobs)
          .values({ name: "sync-titles", runAt: new Date().toISOString() });
        expect(await processPendingJobs()).toBe(1);
        expect(
          (await getDb().select().from(jobs).all()).every(
            (job) => job.status === "completed",
          ),
        ).toBe(true);
      }
    }

    it("sends arrival and departure alerts for freshly upserted offers", async () => {
      const send = mock(async () => {});
      spies.push(
        spyOn(registry, "getProvider").mockReturnValue({
          name: "discord",
          validateConfig: () => ({ valid: true }),
          send,
        }),
        spyOn(syncTitles, "fetchNewReleases")
          .mockResolvedValueOnce([
            makeParsedTitle({ offers: [makeParsedOffer()] }),
          ])
          .mockResolvedValueOnce([
            makeParsedTitle({
              offers: [makeParsedOffer({ monetizationType: "RENT" })],
            }),
          ]),
      );
      await dispatch();
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenLastCalledWith(
        {},
        expect.objectContaining({
          streamingAlerts: [
            expect.objectContaining({
              titleId,
              providerName: "Netflix",
              kind: "arrival",
            }),
          ],
        }),
      );
      await dispatch();
      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenLastCalledWith(
        {},
        expect.objectContaining({
          streamingAlerts: [
            expect.objectContaining({
              titleId,
              providerName: "Netflix",
              kind: "departure",
            }),
          ],
        }),
      );
    });

    for (const failingCheck of ["arrival", "departure"] as const) {
      it(`does not retry the sync batch when the ${failingCheck} checker fails`, async () => {
        const fetch = spyOn(syncTitles, "fetchNewReleases").mockResolvedValue([
          makeParsedTitle(),
        ]);
        const upsert = spyOn(repository, "upsertTitles");
        const arrival = spyOn(
          arrivals,
          "checkStreamingAlerts",
        ).mockResolvedValue();
        const departure = spyOn(
          departures,
          "checkStreamingDepartures",
        ).mockResolvedValue();
        (failingCheck === "arrival" ? arrival : departure).mockRejectedValue(
          new Error("checker database unavailable"),
        );
        spies.push(fetch, upsert, arrival, departure);
        await dispatch();
        expect(arrival).toHaveBeenCalledWith([titleId]);
        expect(departure).toHaveBeenCalledWith([titleId]);
        expect(await processPendingJobs()).toBe(0);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(upsert).toHaveBeenCalledTimes(1);
      });
    }
  });
}
