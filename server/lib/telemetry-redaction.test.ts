import { expect, spyOn, test } from "bun:test";
import { drizzle } from "drizzle-orm/d1";
import { DrizzleQueryError } from "drizzle-orm";
import { redactTelemetry } from "./telemetry-redaction";
import * as schema from "../db/schema";
import { getUserByWatchlistShareToken } from "../db/repository/users";
import { Logger } from "../logger";

test("redacts Sentry request URLs, transaction/span URLs, headers and breadcrumb URLs", () => {
  const token = "ab0123456789cd0123456789ef01234567";
  const event = {
    request: {
      url: `https://example.test/api/share/watchlist/${token}`,
      query_string: `token=${token}&display=lite`,
      headers: { authorization: `Bearer ${token}`, cookie: `session=${token}` },
    },
    transaction: `/share/wrapped/${token}/2026`,
    spans: [
      {
        data: {
          "url.full": `https://example.test/api/kiosk/${token}?access_token=${token}`,
        },
      },
    ],
    breadcrumbs: [
      { data: { url: `https://example.test/share/watchlist/${token}` } },
    ],
    extra: { authToken: token },
  };
  const redacted = redactTelemetry(event);
  expect(JSON.stringify(redacted)).not.toContain(token);
  expect(redacted.transaction).toBe("/share/wrapped/[redacted]/2026");
  expect(redacted.request.query_string).toContain("display=lite");
  expect(event.request.url).toContain(token);
});

test("real Drizzle failures cannot export a bound share token through logs or Sentry", async () => {
  const token = "ab0123456789cd0123456789ef01234567";
  const db = drizzle(
    {
      prepare: () => ({
        bind: () => ({
          raw: async () => {
            throw new Error("synthetic D1 unavailable");
          },
        }),
      }),
    } as unknown as D1Database,
    { schema },
  );
  let failure: unknown;
  try {
    await schema.runWithDb(db, () => getUserByWatchlistShareToken(token));
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(DrizzleQueryError);
  const error = failure as DrizzleQueryError;
  expect(error.message).toContain(token);
  const stderr = spyOn(console, "error").mockImplementation(() => {});
  try {
    const log = new Logger("error");
    log.error(`Unhandled error: ${error.message}`, {
      error: error.message,
      stack: error.stack,
      exception: error,
      params: error.params,
    });
    // The serialization fallback must redact its message as well.
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    log.error(error.message, { circular });
    const logged = stderr.mock.calls.map(([line]) => String(line)).join("\n");
    expect(logged).not.toContain(token);
    expect(logged).toContain("watchlist_share_token");
    expect(logged).toContain("[redacted]");
    expect(logged).toContain("Failed to serialize log data");
    const event = redactTelemetry({
      exception: {
        values: [
          { type: error.name, value: error.message },
          { type: "Error", value: (error.cause as Error).message },
        ],
      },
      extra: { stack: error.stack, params: error.params },
    });
    expect(JSON.stringify(event)).not.toContain(token);
    expect(event.exception.values[1].value).toBe("synthetic D1 unavailable");
    expect(event.extra.stack).toContain("at ");
    expect(event.exception.values[0].value).toContain("watchlist_share_token");
  } finally {
    stderr.mockRestore();
  }
});
