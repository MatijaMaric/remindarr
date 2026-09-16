import { expect, test } from "bun:test";
import { redactTelemetry } from "./telemetry-redaction";

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
