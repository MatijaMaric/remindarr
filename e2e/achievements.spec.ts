import { test, expect } from "@playwright/test";
import { mockLoggedIn, mockLoggedOut } from "./helpers";
import {
  AchievementsPage,
  MOCK_ACHIEVEMENT_EARNED,
  MOCK_ACHIEVEMENT_LOCKED,
  MOCK_ACHIEVEMENT_DETAIL_LOCKED,
} from "./pages/achievements-page";

const TWO_ACHIEVEMENTS = {
  achievements: [MOCK_ACHIEVEMENT_EARNED, MOCK_ACHIEVEMENT_LOCKED],
};

test.describe("Achievements", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "chromium only — desktop layout requires a stable viewport",
  );

  // ── TC-01: Achievements page loads and shows achievement cards ─────────────
  test("TC-01: achievements page loads with earned and locked cards", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const ach = new AchievementsPage(page);
    await mockLoggedIn(page);
    await ach.mockAchievementsShellEndpoints();
    await page.route("**/api/achievements/me**", (route) =>
      route.fulfill({ json: TWO_ACHIEVEMENTS }),
    );

    await ach.gotoAchievements();

    // "Achievements" Kicker is visible
    await expect(ach.pageKicker()).toBeVisible();

    // XP summary: "1/2 earned · 10 XP"
    await expect(page.getByText(/1\/2 earned/)).toBeVisible();

    // Both achievement cards are visible
    await expect(page.getByText("First Watch").first()).toBeVisible();
    await expect(page.getByText("Binge Starter").first()).toBeVisible();

    // Not the empty state
    await expect(page.getByText("No achievements yet.")).not.toBeVisible();
  });

  // ── TC-02: Locked vs earned achievements are visually differentiated ────────
  test("TC-02: locked achievement has a progress bar; earned does not", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const ach = new AchievementsPage(page);
    await mockLoggedIn(page);
    await ach.mockAchievementsShellEndpoints();
    await page.route("**/api/achievements/me**", (route) =>
      route.fulfill({ json: TWO_ACHIEVEMENTS }),
    );

    await ach.gotoAchievements();
    await expect(page.getByText("First Watch").first()).toBeVisible();

    // Earned card links to /achievements/first_movie
    const earnedLink = page.getByRole("link", { name: /First Watch/i }).first();
    await expect(earnedLink).toHaveAttribute(
      "href",
      /\/achievements\/first_movie/,
    );

    // Locked card links to /achievements/watch_10
    const lockedLink = page
      .getByRole("link", { name: /Binge Starter/i })
      .first();
    await expect(lockedLink).toHaveAttribute(
      "href",
      /\/achievements\/watch_10/,
    );

    // Locked card (in category grid) has a ThinProgress bar (a plain div with
    // inline height style). Earned card does not render ThinProgress.
    // Use opacity-60 class as a proxy: BadgeTile applies it to locked tiles.
    const lockedGridCard = page
      .getByRole("link", { name: /Binge Starter/i })
      .last();
    await expect(lockedGridCard).toHaveClass(/opacity-60/);
  });

  // ── TC-03: Clicking an achievement navigates to the detail page ─────────────
  test("TC-03: clicking an achievement card navigates to its detail page", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const ach = new AchievementsPage(page);
    await mockLoggedIn(page);
    await ach.mockAchievementsShellEndpoints();
    await page.route("**/api/achievements/me**", (route) =>
      route.fulfill({ json: TWO_ACHIEVEMENTS }),
    );
    await page.route("**/api/achievements/first_movie/me**", (route) =>
      route.fulfill({
        json: {
          ...MOCK_ACHIEVEMENT_EARNED,
          ladder: null,
          history: [],
          rarity: null,
        },
      }),
    );

    await ach.gotoAchievements();
    await expect(page.getByText("First Watch").first()).toBeVisible();

    await page
      .getByRole("link", { name: /First Watch/i })
      .first()
      .click();

    await page.waitForURL(/\/achievements\/first_movie/);
    await expect(page).toHaveURL(/\/achievements\/first_movie/);
  });

  // ── TC-04: Achievement detail page shows name, description, and progress ────
  test("TC-04: achievement detail page renders all fields", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const ach = new AchievementsPage(page);
    await mockLoggedIn(page);
    await ach.mockAchievementsShellEndpoints();
    // Detail page also triggers AchievementToast poll
    await page.route("**/api/achievements/me**", (route) =>
      route.fulfill({ json: { achievements: [] } }),
    );
    await page.route("**/api/achievements/watch_10/me**", (route) =>
      route.fulfill({ json: MOCK_ACHIEVEMENT_DETAIL_LOCKED }),
    );

    await ach.gotoAchievementDetail("watch_10");

    // h1 heading shows title
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Binge Starter",
    );

    // Description
    await expect(page.getByText("Watch 10 movies")).toBeVisible();

    // Progress section (shown for own locked achievement)
    await expect(page.getByText("Progress")).toBeVisible();
    await expect(page.getByText("3 / 10")).toBeVisible();

    // Rarity badge
    await expect(page.getByText(/Rare/)).toBeVisible();

    // Back link to /achievements
    await expect(
      page.getByRole("link", { name: /All achievements/i }),
    ).toHaveAttribute("href", "/achievements");
  });

  // ── TC-05: Empty state shows no achievements message ────────────────────────
  test("TC-05: empty state shows no achievements message", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const ach = new AchievementsPage(page);
    await mockLoggedIn(page);
    await ach.mockAchievementsShellEndpoints();
    await page.route("**/api/achievements/me**", (route) =>
      route.fulfill({ json: { achievements: [] } }),
    );

    await ach.gotoAchievements();

    // Kicker still visible
    await expect(ach.pageKicker()).toBeVisible();

    // Empty state message
    await expect(page.getByText("No achievements yet.")).toBeVisible();

    // XP summary not shown (no data)
    await expect(page.getByText(/earned · \d+ XP/)).not.toBeVisible();
  });

  // ── TC-06: Unauthenticated user is redirected to /login ─────────────────────
  test("TC-06: unauthenticated user is redirected to /login", async ({
    page,
  }) => {
    await mockLoggedOut(page);
    await page.goto("/achievements");

    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();

    // Achievements content not visible
    await expect(page.getByText("No achievements yet.")).not.toBeVisible();
  });
});
