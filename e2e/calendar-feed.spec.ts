import { test, expect } from "@playwright/test";
import { registerUser } from "./fixtures/auth";

// The calendar feed flow is pure HTTP — no browser UI involved. Running it in
// a single project keeps the backend state assertions deterministic.
test.describe.configure({ mode: "serial" });

test.describe("Calendar feed token flow", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "HTTP-only flow; running once under chromium is sufficient"
  );

  test("registered user can mint a feed token and fetch a valid .ics", async ({ request }) => {
    const user = await registerUser(request);

    // sign-up implicitly returns a session cookie; request fixture auto-stores it.
    const tokenRes = await request.get("/api/feed/token");
    expect(tokenRes.ok()).toBeTruthy();
    let { token } = (await tokenRes.json()) as { token: string | null };

    // Mint one if the user doesn't have one yet.
    if (!token) {
      const regen = await request.post("/api/feed/token/regenerate");
      expect(regen.ok()).toBeTruthy();
      ({ token } = (await regen.json()) as { token: string });
    }
    expect(token).toBeTruthy();

    const feedRes = await request.get(
      `/api/feed/calendar.ics?token=${encodeURIComponent(token!)}`
    );
    expect(feedRes.status()).toBe(200);
    expect(feedRes.headers()["content-type"]).toMatch(/text\/calendar/i);
    const body = await feedRes.text();
    expect(body.startsWith("BEGIN:VCALENDAR")).toBeTruthy();
    expect(body).toContain("END:VCALENDAR");
    expect(body).toContain(`PRODID:-//Remindarr//EN`);
    expect(user.username).toBeTruthy();
  });

  test("feed endpoint rejects invalid tokens", async ({ request }) => {
    const res = await request.get("/api/feed/calendar.ics?token=definitely-not-valid");
    expect(res.status()).toBe(401);
  });
});
