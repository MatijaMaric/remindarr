import { test, expect } from "@playwright/test";
import { isAuthGetSession } from "./helpers";
import { KioskPage } from "./pages/kiosk-page";

test.describe.configure({ mode: "serial" });

const STANDARD_KIOSK_DATA = {
  meta: {
    household: "alice",
    fidelity: "rich",
    refresh_interval_seconds: 300,
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
      air_date: "2026-05-23",
      provider: "Netflix",
      kind: "episode",
      is_watched: false,
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
      air_date: "2026-04-01",
      provider: "HBO Max",
      left: 5,
    },
  ],
  queue_total: 1,
};

async function setupKioskShellMocks(page: KioskPage["page"]) {
  // Prevent shell auth requests from erroring on public page
  await page.route(isAuthGetSession, (route) => route.fulfill({ json: null }));
  await page.route("**/api/auth/custom/providers", (route) =>
    route.fulfill({ json: { local: true, oidc: null } }),
  );
}

test.describe("Kiosk page", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Running on chromium only",
  );

  test("TC-01: Page renders header, hero, the queue panel and footer, each show once", async ({
    page,
  }) => {
    const kp = new KioskPage(page);
    await setupKioskShellMocks(page);
    await page.route("**/api/kiosk/test-kiosk-token**", (route) =>
      route.fulfill({ json: STANDARD_KIOSK_DATA }),
    );

    await kp.gotoKiosk("test-kiosk-token");
    await kp.waitForVisible(kp.wordmark());

    // Header: wordmark, household
    await expect(kp.wordmark()).toBeVisible();
    await expect(page.getByText("alice").first()).toBeVisible();

    // Hero: today's episode leads the screen
    await expect(page.getByText(/new today · netflix/i)).toBeVisible();
    await expect(page.getByText("Test Show").first()).toBeVisible();
    await expect(
      page.getByText(/S1·E2/, { exact: false }).first(),
    ).toBeVisible();
    await expect(page.getByText("Second Episode").first()).toBeVisible();
    await expect(page.getByText("Cast to TV")).toHaveCount(0);

    // The hero is the only episode today, so it is not repeated in a panel
    await expect(page.getByText("Test Show")).toHaveCount(1);
    await expect(page.getByText(/^\d+ episodes?$/)).toHaveCount(0);

    // Up next panel
    await expect(
      page.getByText(/up next in your queue/i).first(),
    ).toBeVisible();
    await expect(page.getByText("1 show", { exact: true })).toBeVisible();
    await expect(page.getByText("Old Show").first()).toBeVisible();
    await expect(
      page.getByText(/5.*left/i, { exact: false }).first(),
    ).toBeVisible();

    // Footer
    await expect(page.getByText(/auto-refreshes every 5 min/i)).toBeVisible();
    await expect(page.getByText(/token/i)).toHaveCount(0);
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

    // Footer auto-refresh label: 1800s = 30 min
    await expect(page.getByText(/auto-refreshes every 30 min/i)).toBeVisible();
  });

  test("TC-05: A premiere today leads the screen with a 'New today' kicker", async ({
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
              air_date: "2026-05-23",
              provider: "Disney+",
              kind: "premiere",
              is_watched: false,
            },
          ],
          unwatched_queue: [],
          queue_total: 0,
        },
      }),
    );

    await kp.gotoKiosk("fallback-token");
    await kp.waitForVisible(kp.wordmark());

    // Hero kicker (text-transformed to uppercase by CSS)
    await expect(page.getByText(/new today · disney\+/i)).toBeVisible();

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
          releasing_today: [],
          unwatched_queue: [],
          queue_total: 0,
        },
      }),
    );

    await kp.gotoKiosk("empty-token");
    await kp.waitForVisible(kp.wordmark());

    // Hero empty state (text-transformed uppercase by CSS)
    await expect(page.getByText(/nothing on the slate today/i)).toBeVisible();

    // Empty panels are not rendered
    await expect(page.getByText("Up next in your queue")).toHaveCount(0);
    await expect(page.getByText("New today", { exact: true })).toHaveCount(0);
  });
});
