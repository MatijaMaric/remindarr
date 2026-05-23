import { test, expect } from "@playwright/test";
import { mockLoggedIn, mockLoggedOut } from "./helpers";
import {
  StatsPage,
  MOCK_STATS_FULL,
  MOCK_STATS_EMPTY,
} from "./pages/stats-page";

const EMPTY_TRACKED = {
  titles: [],
  count: 0,
  profile_public: false,
  profile_visibility: "private",
};

test.describe("Stats", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "chromium only — desktop layout requires a stable viewport",
  );

  // ── TC-01: Stats page loads with all sections visible ──────────────────────
  test("TC-01: stats page loads with all sections visible", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const stats = new StatsPage(page);
    await mockLoggedIn(page);
    await stats.mockTrackedShellEndpoints();
    await page.route("**/api/track**", (route) =>
      route.fulfill({ json: EMPTY_TRACKED }),
    );
    await page.route("**/api/stats**", (route) =>
      route.fulfill({ json: MOCK_STATS_FULL }),
    );

    await stats.gotoTracked();
    await stats.clickStatsPill();

    // Overview section cards
    await expect(page.getByText("Movies Watched")).toBeVisible();
    await expect(page.getByText("Episodes Watched")).toBeVisible();
    await expect(page.getByText("Shows Tracked")).toBeVisible();
    await expect(page.getByText("Movies Tracked")).toBeVisible();
    await expect(page.getByText("Watch Time", { exact: true })).toBeVisible();
    await expect(page.getByText("Watchlist ETA")).toBeVisible();

    // Monthly Activity section (legend items use exact: true to avoid
    // matching "Episodes Watched" / "Movies Watched" overview card labels)
    await expect(page.getByText("Monthly Activity")).toBeVisible();
    await expect(page.getByText("Episodes", { exact: true })).toBeVisible();
    await expect(page.getByText("Movies", { exact: true })).toBeVisible();

    // Genre, Language, Status sections
    await expect(page.getByText("Top Genres")).toBeVisible();
    await expect(page.getByText("Top Languages")).toBeVisible();
    await expect(page.getByText("Shows by Status")).toBeVisible();

    // Watch time breakdown cards
    await expect(page.getByText("TV Watch Time")).toBeVisible();
    await expect(page.getByText("Movie Watch Time")).toBeVisible();
  });

  // ── TC-02: Stats show correct counts from mock data ─────────────────────────
  test("TC-02: stats show correct counts", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const stats = new StatsPage(page);
    await mockLoggedIn(page);
    await stats.mockTrackedShellEndpoints();
    await page.route("**/api/track**", (route) =>
      route.fulfill({ json: EMPTY_TRACKED }),
    );
    await page.route("**/api/stats**", (route) =>
      route.fulfill({ json: MOCK_STATS_FULL }),
    );

    await stats.gotoTracked();
    await stats.clickStatsPill();

    // Wait for stats to render (skeleton disappears)
    await expect(page.getByText("Movies Watched")).toBeVisible();

    // Overview card values
    await expect(page.getByText("12").first()).toBeVisible(); // watched_movies
    await expect(page.getByText("84").first()).toBeVisible(); // watched_episodes
    await expect(page.getByText("5").first()).toBeVisible(); // tracked_shows
    await expect(page.getByText("7").first()).toBeVisible(); // tracked_movies
    await expect(page.getByText("62h")).toBeVisible(); // 3720 min = 62h
    await expect(page.getByText("~2w")).toBeVisible(); // 14 days ≈ 2 weeks

    // Watch-time breakdown
    await expect(page.getByText("21h")).toBeVisible(); // 1260 min = 21h
    await expect(page.getByText("84 episodes")).toBeVisible();
    await expect(page.getByText("41h")).toBeVisible(); // 2460 min = 41h
    await expect(page.getByText("12 movies")).toBeVisible();

    // Top Genres
    await expect(page.getByText("Drama")).toBeVisible();
    await expect(page.getByText("Action")).toBeVisible();

    // Top Languages (language codes mapped to display names)
    await expect(page.getByText("English")).toBeVisible();
    await expect(page.getByText("Japanese")).toBeVisible();

    // Shows by Status — only non-zero entries rendered.
    // "Watching" also appears in TrackedStatsBand as "Currently watching" but exact:true
    // avoids that. "Completed" appears in both TrackedStatsBand and ShowStatusGrid;
    // scope to the Shows by Status section heading's sibling grid.
    await expect(page.getByText("Watching", { exact: true })).toBeVisible();
    await expect(page.getByText("Caught Up", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Shows by Status").locator("..").getByText("Completed"),
    ).toBeVisible();
    // Zero-count entries are NOT rendered
    await expect(
      page.getByText("Not Started", { exact: true }),
    ).not.toBeVisible();
    await expect(page.getByText("On Hold", { exact: true })).not.toBeVisible();
    await expect(page.getByText("Dropped", { exact: true })).not.toBeVisible();
  });

  // ── TC-03: Empty stats — new user with no watch history ─────────────────────
  test("TC-03: empty stats show zeros and hide empty sections", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const stats = new StatsPage(page);
    await mockLoggedIn(page);
    await stats.mockTrackedShellEndpoints();
    await page.route("**/api/track**", (route) =>
      route.fulfill({ json: EMPTY_TRACKED }),
    );
    await page.route("**/api/stats**", (route) =>
      route.fulfill({ json: MOCK_STATS_EMPTY }),
    );

    await stats.gotoTracked();
    await stats.clickStatsPill();

    // Wait for stats to render
    await expect(page.getByText("Movies Watched")).toBeVisible();

    // Overview cards show zero values
    await expect(page.getByText("0h").first()).toBeVisible();
    // Watchlist ETA is null → displayed as "—" (use first() since TrackedStatsBand
    // also shows "—" for avg score when there are no rated titles)
    await expect(page.getByText("—").first()).toBeVisible();

    // Monthly Activity section is always rendered
    await expect(page.getByText("Monthly Activity")).toBeVisible();

    // Empty array sections are hidden
    await expect(page.getByText("Top Genres")).not.toBeVisible();
    await expect(page.getByText("Top Languages")).not.toBeVisible();
    // tracked_shows === 0 → Shows by Status hidden
    await expect(page.getByText("Shows by Status")).not.toBeVisible();

    // No error banner
    await expect(page.locator(".bg-red-900\\/50")).not.toBeVisible();
  });

  // ── TC-04: Unauthenticated user is redirected to /login ─────────────────────
  test("TC-04: unauthenticated user is redirected to /login", async ({
    page,
  }) => {
    await mockLoggedOut(page);
    await page.goto("/stats");

    // RequireAuth redirects to /login
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();

    // Stats content is not visible
    await expect(page.getByText("Monthly Activity")).not.toBeVisible();
  });
});
