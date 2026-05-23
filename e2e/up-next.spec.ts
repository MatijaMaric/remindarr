import { test, expect } from "@playwright/test";
import { mockLoggedOut, mockLoggedIn } from "./helpers";
import { UpNextPage } from "./pages/up-next-page";

test.describe.configure({ mode: "serial" });

const UP_NEXT_RESPONSE = {
  items: [
    {
      kind: "in_progress",
      titleId: 98765,
      title: "Test Show",
      posterUrl: null,
      nextEpisodeId: 101,
      nextEpisodeTitle: "Pilot",
      nextEpisodeSeason: 1,
      nextEpisodeNumber: 1,
      nextEpisodeAirDate: "2023-03-01",
      unwatchedCount: 3,
    },
  ],
};

const HOMEPAGE_LAYOUT = {
  homepage_layout: [
    { id: "up_next", enabled: true },
    { id: "unwatched", enabled: false },
    { id: "recommendations", enabled: false },
    { id: "today", enabled: false },
    { id: "upcoming", enabled: false },
    { id: "airing_soon", enabled: false },
    { id: "friends_loved", enabled: false },
    { id: "movies_to_watch", enabled: false },
    { id: "upcoming_movies", enabled: false },
    { id: "streak", enabled: false },
  ],
};

async function setupHomeMocks(
  page: UpNextPage["page"],
  upNextResponse = UP_NEXT_RESPONSE,
) {
  // Mirror the pattern from e2e/pages/home-page.ts: no catch-all.
  // Mock every endpoint the HomePage Promise.all needs, plus background
  // auth-context calls that would fire auth:unauthorized if unmocked.
  await page.route("**/api/episodes/upcoming", (route) =>
    route.fulfill({ json: { today: [], upcoming: [], unwatched: [] } }),
  );
  await page.route("**/api/recommendations/count**", (route) =>
    route.fulfill({ json: { count: 0 } }),
  );
  await page.route("**/api/recommendations**", (route) =>
    route.fulfill({ json: { recommendations: [], count: 0 } }),
  );
  await page.route("**/api/user/settings/homepage-layout**", (route) =>
    route.fulfill({ json: HOMEPAGE_LAYOUT }),
  );
  await page.route("**/api/up-next**", (route) =>
    route.fulfill({ json: upNextResponse }),
  );
  await page.route("**/api/social/friends-loved**", (route) =>
    route.fulfill({ json: { items: [] } }),
  );
  await page.route("**/api/streak/me**", (route) =>
    route.fulfill({ json: null }),
  );
  await page.route("**/api/movies/tracking**", (route) =>
    route.fulfill({ json: { to_watch: [], upcoming: [] } }),
  );
  await page.route("**/api/user/settings/subscriptions**", (route) =>
    route.fulfill({ json: { providerIds: [] } }),
  );
  await page.route("**/api/achievements/me**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/suggestions**", (route) =>
    route.fulfill({ json: { flat: [], bySource: {} } }),
  );
}

test.describe("Up Next section (HomePage)", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Running on chromium only",
  );

  test("TC-01: Up Next section renders show cards with episode details", async ({
    page,
  }) => {
    const unp = new UpNextPage(page);
    await setupHomeMocks(page);
    await mockLoggedIn(page);
    await unp.gotoHome();
    await unp.waitForVisible(unp.upNextHeading());

    // Section heading and kicker
    await expect(unp.upNextHeading()).toBeVisible();
    await expect(page.getByText("In Progress").first()).toBeVisible();
    // Show name
    await expect(page.getByText("Test Show").first()).toBeVisible();
    // Episode code
    await expect(page.getByText("S01·E01")).toBeVisible();
    // Episode title
    await expect(page.getByText("Pilot")).toBeVisible();
    // Unwatched count badge: +3
    await expect(page.getByText("+3")).toBeVisible();
    // Mark Watched button
    await expect(unp.markWatchedButton()).toBeVisible();
  });

  test("TC-02: Up Next — unauthenticated user does not see Up Next section", async ({
    page,
  }) => {
    const unp = new UpNextPage(page);
    await page.route("**/api/browse**", (route) =>
      route.fulfill({
        json: { titles: [], page: 1, totalPages: 1, totalResults: 0 },
      }),
    );
    await mockLoggedOut(page);
    await unp.gotoHome();
    await page.waitForTimeout(500);

    expect(page.url()).toContain("/");
    await expect(unp.upNextHeading()).not.toBeVisible();
    // Landing page CTA
    await expect(
      page.getByRole("link", { name: /sign in/i }).first(),
    ).toBeVisible();
  });

  test("TC-03: episode details visible in Up Next card", async ({ page }) => {
    const unp = new UpNextPage(page);
    await setupHomeMocks(page, {
      items: [
        {
          kind: "newly_aired",
          titleId: 11111,
          title: "My Drama",
          posterUrl: null,
          nextEpisodeId: 202,
          nextEpisodeTitle: "The Reveal",
          nextEpisodeSeason: 2,
          nextEpisodeNumber: 5,
          nextEpisodeAirDate: "2026-04-15",
          unwatchedCount: 1,
        },
      ],
    });
    await mockLoggedIn(page);
    await unp.gotoHome();
    await unp.waitForVisible(unp.upNextHeading());

    // Show name
    await expect(page.getByText("My Drama")).toBeVisible();
    // Episode code
    await expect(page.getByText("S02·E05")).toBeVisible();
    // Episode title
    await expect(page.getByText(/The Reveal/)).toBeVisible();
    // Kind badge: New Episodes
    await expect(page.getByText("New Episodes").first()).toBeVisible();
    // No +1 badge (unwatchedCount === 1, not > 1)
    await expect(page.getByText("+1")).not.toBeVisible();
  });

  test("TC-04: empty state when no Up Next items", async ({ page }) => {
    const unp = new UpNextPage(page);
    await setupHomeMocks(page, { items: [] });
    await mockLoggedIn(page);
    await unp.gotoHome();
    await unp.waitForVisible(unp.upNextHeading());

    await expect(
      page.getByText(/Nothing queued|You're all caught up/i),
    ).toBeVisible();
    await expect(page.getByText("Test Show")).not.toBeVisible();
  });

  test("TC-05: clicking a title in Up Next navigates to title detail", async ({
    page,
  }) => {
    const unp = new UpNextPage(page);
    await setupHomeMocks(page);
    await mockLoggedIn(page);
    await unp.gotoHome();
    await unp.waitForVisible(unp.upNextHeading());
    await unp.waitForVisible(page.getByText("Test Show").first());

    await page.getByRole("link", { name: "Test Show" }).first().click();
    await page.waitForURL("**/title/98765**", { waitUntil: "commit" });

    expect(page.url()).toContain("/title/98765");
    await expect(unp.upNextHeading()).not.toBeVisible();
  });
});
