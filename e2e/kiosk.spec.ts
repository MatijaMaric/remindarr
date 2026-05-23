import { test, expect } from "@playwright/test";
import { KioskPage } from "./pages/kiosk-page";

test.describe.configure({ mode: "serial" });

const STANDARD_KIOSK_DATA = {
  meta: {
    household: "alice",
    fidelity: "rich",
    refresh_interval_seconds: 300,
  },
  airing_now: {
    id: 101,
    title_id: "tt9876543",
    show_title: "Test Show",
    poster_url: null,
    backdrop_url: null,
    season_number: 1,
    episode_number: 2,
    ep_title: "Second Episode",
    air_date: "2026-05-23T20:00:00Z",
    provider: "Netflix",
  },
  releasing_today: [
    {
      id: 101,
      title_id: "tt9876543",
      show_title: "Test Show",
      poster_url: null,
      backdrop_url: null,
      season_number: 1,
      episode_number: 2,
      ep_title: "Second Episode",
      air_date: "2026-05-23T20:00:00Z",
      provider: "Netflix",
      kind: "episode",
    },
  ],
  unwatched_queue: [
    {
      id: 99,
      title_id: "tt1111111",
      show_title: "Old Show",
      poster_url: null,
      season_number: 2,
      episode_number: 3,
      ep_title: "The One",
      air_date: "2026-04-01T00:00:00Z",
      provider: "HBO Max",
      left: 5,
    },
  ],
};

async function setupKioskShellMocks(page: KioskPage["page"]) {
  // Prevent shell auth requests from erroring on public page
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ json: null }),
  );
  await page.route("**/api/auth/custom/providers", (route) =>
    route.fulfill({ json: { local: true, oidc: null } }),
  );
}

test.describe("Kiosk page", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Running on chromium only",
  );

  test("TC-01: Page renders the full kiosk layout with header, hero, and two panels", async ({
    page,
  }) => {
    const kp = new KioskPage(page);
    await setupKioskShellMocks(page);
    await page.route("**/api/kiosk/test-kiosk-token**", (route) =>
      route.fulfill({ json: STANDARD_KIOSK_DATA }),
    );

    await kp.gotoKiosk("test-kiosk-token");
    await kp.waitForVisible(kp.wordmark());

    // Header: wordmark, fidelity badge, household
    await expect(kp.wordmark()).toBeVisible();
    await expect(kp.fidelityBadge("RICH")).toBeVisible();
    await expect(page.getByText("alice").first()).toBeVisible();

    // Hero: kicker, show title, episode info, decorative cast button
    await expect(
      page.getByText(/airing now/i, { exact: false }).first(),
    ).toBeVisible();
    await expect(page.getByText("Test Show").first()).toBeVisible();
    await expect(
      page.getByText(/S1·E2/, { exact: false }).first(),
    ).toBeVisible();
    await expect(page.getByText("Second Episode").first()).toBeVisible();
    // Cast to TV is aria-hidden decorative element — check text is present
    await expect(page.getByText("Cast to TV")).toBeVisible();

    // Releasing today panel
    await expect(page.getByText(/releasing today/i).first()).toBeVisible();
    await expect(page.getByText(/1 drops/i)).toBeVisible();
    await expect(page.getByText("Netflix").first()).toBeVisible();

    // Up next panel
    await expect(
      page.getByText(/up next in your queue/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/1 unwatched/i)).toBeVisible();
    await expect(page.getByText("Old Show").first()).toBeVisible();
    await expect(
      page.getByText(/5.*left/i, { exact: false }).first(),
    ).toBeVisible();

    // Footer
    await expect(page.getByText(/auto-refreshes every 5 min/i)).toBeVisible();
    await expect(page.getByText(/token test/i)).toBeVisible();
  });

  test("TC-02: Invalid token shows the 'Kiosk unavailable' error screen", async ({
    page,
  }) => {
    const kp = new KioskPage(page);
    await setupKioskShellMocks(page);
    await page.route("**/api/kiosk/bad-token**", (route) =>
      route.fulfill({
        status: 401,
        json: { error: "Invalid kiosk token" },
      }),
    );

    await kp.gotoKiosk("bad-token");
    await kp.waitForVisible(kp.errorHeading());

    await expect(kp.errorHeading()).toBeVisible();
    await expect(
      page.getByText(
        "This kiosk link is no longer valid. Ask the owner to share a new one.",
      ),
    ).toBeVisible();

    // Kiosk layout elements are NOT rendered
    await expect(kp.wordmark()).not.toBeVisible();
    await expect(kp.fidelityBadge("RICH")).not.toBeVisible();
  });

  test("TC-03: Kiosk page does not require an active user session", async ({
    page,
  }) => {
    const kp = new KioskPage(page);
    await setupKioskShellMocks(page);
    await page.route("**/api/kiosk/public-kiosk-token**", (route) =>
      route.fulfill({ json: STANDARD_KIOSK_DATA }),
    );

    await kp.gotoKiosk("public-kiosk-token");
    await kp.waitForVisible(kp.wordmark());

    // URL remains on kiosk page — no redirect to /login
    expect(page.url()).toContain("/kiosk/public-kiosk-token");

    // Household name visible
    await expect(page.getByText("alice").first()).toBeVisible();
  });

  test("TC-04: Kiosk renders correctly in 'epaper' fidelity mode", async ({
    page,
  }) => {
    const kp = new KioskPage(page);
    await setupKioskShellMocks(page);
    await page.route("**/api/kiosk/epaper-token**", (route) =>
      route.fulfill({
        json: {
          ...STANDARD_KIOSK_DATA,
          meta: {
            household: "alice",
            fidelity: "epaper",
            refresh_interval_seconds: 1800,
          },
        },
      }),
    );

    await kp.gotoKiosk("epaper-token", "epaper");
    await kp.waitForVisible(kp.wordmark());

    // Fidelity badge reads EPAPER
    await expect(kp.fidelityBadge("EPAPER")).toBeVisible();

    // Footer auto-refresh label: 1800s = 30 min
    await expect(page.getByText(/auto-refreshes every 30 min/i)).toBeVisible();
  });

  test("TC-05: Hero falls back to 'Releasing today' when nothing is airing now", async ({
    page,
  }) => {
    const kp = new KioskPage(page);
    await setupKioskShellMocks(page);
    await page.route("**/api/kiosk/fallback-token**", (route) =>
      route.fulfill({
        json: {
          meta: {
            household: "bob",
            fidelity: "rich",
            refresh_interval_seconds: 300,
          },
          airing_now: null,
          releasing_today: [
            {
              id: 200,
              title_id: "tt2222222",
              show_title: "New Release",
              poster_url: null,
              backdrop_url: null,
              season_number: 1,
              episode_number: 1,
              ep_title: "Pilot",
              air_date: "2026-05-23T00:00:00Z",
              provider: "Disney+",
              kind: "series",
            },
          ],
          unwatched_queue: [],
        },
      }),
    );

    await kp.gotoKiosk("fallback-token");
    await kp.waitForVisible(kp.wordmark());

    // Hero shows "Releasing today" kicker (text-transformed to uppercase by CSS)
    await expect(
      page.getByText(/releasing today/i, { exact: false }).first(),
    ).toBeVisible();

    // Hero shows the fallback title info
    await expect(page.getByText("New Release").first()).toBeVisible();
    await expect(
      page.getByText(/S1·E1/, { exact: false }).first(),
    ).toBeVisible();
    await expect(page.getByText("Pilot").first()).toBeVisible();
  });

  test("TC-06: Hero shows 'Nothing on the slate today' when all lists are empty", async ({
    page,
  }) => {
    const kp = new KioskPage(page);
    await setupKioskShellMocks(page);
    await page.route("**/api/kiosk/empty-token**", (route) =>
      route.fulfill({
        json: {
          meta: {
            household: "carol",
            fidelity: "rich",
            refresh_interval_seconds: 300,
          },
          airing_now: null,
          releasing_today: [],
          unwatched_queue: [],
        },
      }),
    );

    await kp.gotoKiosk("empty-token");
    await kp.waitForVisible(kp.wordmark());

    // Hero empty state (text-transformed uppercase by CSS)
    await expect(page.getByText(/nothing on the slate today/i)).toBeVisible();

    // Panel empty states
    await expect(page.getByText("No releases today.")).toBeVisible();
    await expect(page.getByText("All caught up!")).toBeVisible();
  });
});
