import { test, expect } from "@playwright/test";
import { mockLoggedIn, mockLoggedOut } from "./helpers";
import {
  LeaderboardPage,
  MOCK_LEADERBOARD_FOUR_ENTRIES,
  MOCK_LEADERBOARD_WITH_ME,
} from "./pages/leaderboard-page";

test.describe("Leaderboard", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "chromium only — desktop layout requires a stable viewport",
  );

  // ── TC-01: Leaderboard loads and shows ranked users ──────────────────────────
  test("TC-01: leaderboard loads with podium and ranked list", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const lb = new LeaderboardPage(page);
    await mockLoggedIn(page);
    await lb.mockLeaderboardShellEndpoints();
    await page.route("**/api/leaderboard**", (route) =>
      route.fulfill({ json: MOCK_LEADERBOARD_FOUR_ENTRIES }),
    );

    await lb.gotoLeaderboard();
    await expect(lb.pageHeading()).toBeVisible();

    // Subtitle
    await expect(page.getByText("Among people you follow")).toBeVisible();

    // Podium: ranks 1–3 visible
    await expect(page.getByText("#1")).toBeVisible();
    await expect(page.getByText("#2")).toBeVisible();
    await expect(page.getByText("#3")).toBeVisible();

    // Podium entries: Alice (rank 1, shown center), Bob (rank 2, left), Charlie (rank 3, right)
    await expect(page.getByText("Alice", { exact: true })).toBeVisible();
    await expect(page.getByText("Bob", { exact: true })).toBeVisible();
    await expect(page.getByText("Charlie", { exact: true })).toBeVisible();

    // XP visible for podium entries
    await expect(page.getByText("500 XP")).toBeVisible();

    // Ranked list shows Diana at #4
    await expect(page.getByText("#4")).toBeVisible();
    await expect(page.getByText("Diana", { exact: true })).toBeVisible();

    // No error banner
    await expect(page.locator(".bg-red-900\\/40")).not.toBeVisible();
  });

  // ── TC-02: Current user's entry is highlighted ───────────────────────────────
  test("TC-02: current user podium card has amber highlight", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const lb = new LeaderboardPage(page);
    await mockLoggedIn(page);
    await lb.mockLeaderboardShellEndpoints();
    await page.route("**/api/leaderboard**", (route) =>
      route.fulfill({ json: MOCK_LEADERBOARD_WITH_ME }),
    );

    await lb.gotoLeaderboard();
    await expect(lb.pageHeading()).toBeVisible();

    // Current user is rank 2 (in podium). Locate the @testuser text, then
    // walk up to the podium card container and verify amber highlight class.
    const usernameEl = page.getByText("@testuser");
    await expect(usernameEl).toBeVisible();

    // The PodiumSpot div is the first ancestor div with border-amber-400/40
    const podiumCard = usernameEl
      .locator("xpath=ancestor::div[contains(@class,'border-amber')]")
      .first();
    await expect(podiumCard).toBeVisible();
    await expect(podiumCard).toHaveClass(/border-amber/);

    // Other podium cards (Alice, Bob) do not have amber border
    const aliceCard = page
      .getByText("@alice")
      .locator("xpath=ancestor::div[contains(@class,'rounded-xl')]")
      .first();
    await expect(aliceCard).not.toHaveClass(/border-amber/);
  });

  // ── TC-03: Empty leaderboard shows empty state message ───────────────────────
  test("TC-03: empty leaderboard shows follow prompt", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const lb = new LeaderboardPage(page);
    await mockLoggedIn(page);
    await lb.mockLeaderboardShellEndpoints();
    await page.route("**/api/leaderboard**", (route) =>
      route.fulfill({ json: { entries: [] } }),
    );

    await lb.gotoLeaderboard();

    // Heading and subtitle visible in empty state
    await expect(lb.pageHeading()).toBeVisible();
    await expect(page.getByText("Among people you follow")).toBeVisible();

    // Empty state message
    await expect(
      page.getByText(/follow people to see them on the leaderboard/i),
    ).toBeVisible();

    // No podium rank labels
    await expect(page.getByText("#1")).not.toBeVisible();
    await expect(page.getByText("#2")).not.toBeVisible();
    await expect(page.getByText("#3")).not.toBeVisible();
  });

  // ── TC-05: Unauthenticated user is redirected to /login ──────────────────────
  test("TC-05: unauthenticated user is redirected to /login", async ({
    page,
  }) => {
    await mockLoggedOut(page);
    await page.goto("/leaderboard");

    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();

    // Leaderboard content not visible
    await expect(
      page.getByRole("heading", { name: /leaderboard/i }),
    ).not.toBeVisible();
  });
});
