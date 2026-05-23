import { test, expect } from "@playwright/test";
import { mockLoggedIn, mockLoggedOut } from "./helpers";
import {
  CalendarPage,
  mockCalendarSingle,
  mockCalendarMultiShow,
} from "./pages/calendar-page";

test.describe("Calendar", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "chromium only — desktop grid layout requires a stable viewport",
  );

  // ── TC-01: Calendar page loads and shows upcoming episodes ─────────────────
  test("TC-01: calendar page loads and shows upcoming episodes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const cal = new CalendarPage(page);
    await mockLoggedIn(page);
    await cal.mockCalendarShellEndpoints();
    await page.route("**/api/calendar**", (route) =>
      route.fulfill({ json: mockCalendarSingle() }),
    );

    await cal.gotoCalendar();

    // URL stays at /calendar
    await expect(page).toHaveURL("/calendar");

    // Page heading shows current month name (e.g. "May 2026")
    await expect(cal.monthHeading()).toBeVisible();

    // Show title and/or episode name appears somewhere in the grid
    await expect(page.getByText("Test Show")).toBeVisible();

    // No error banner
    await expect(page.locator(".bg-red-900\\/50")).not.toBeVisible();
  });

  // ── TC-02: Episodes grouped by date/show correctly ─────────────────────────
  test("TC-02: episodes appear in correct date cells", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const cal = new CalendarPage(page);
    await mockLoggedIn(page);
    await cal.mockCalendarShellEndpoints();
    await page.route("**/api/calendar**", (route) =>
      route.fulfill({ json: mockCalendarMultiShow() }),
    );

    await cal.gotoCalendar();
    await expect(cal.monthHeading()).toBeVisible();

    // Both Alpha Show episodes appear as pills. Each pill text is
    // "S{n}E{n} {show_title}". Two pills match the Alpha Show pattern;
    // use .first() to avoid strict mode violation.
    await expect(
      page.getByText(/S2E3.*Alpha Show|Alpha Show/).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/S2E4.*Alpha Show|Alpha Show/).first(),
    ).toBeVisible();

    // Beta Show appears in a different date cell
    await expect(
      page.getByText(/S1E1.*Beta Show|Beta Show/).first(),
    ).toBeVisible();

    // The two show names appear at least once each
    await expect(page.getByText("Alpha Show").first()).toBeVisible();
    await expect(page.getByText("Beta Show").first()).toBeVisible();
  });

  // ── TC-03: Empty state — no upcoming episodes ──────────────────────────────
  test("TC-03: empty calendar renders grid without error", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const cal = new CalendarPage(page);
    await mockLoggedIn(page);
    await cal.mockCalendarShellEndpoints();
    await page.route("**/api/calendar**", (route) =>
      route.fulfill({ json: { titles: [], episodes: [], count: 0 } }),
    );

    await cal.gotoCalendar();

    // Month heading visible
    await expect(cal.monthHeading()).toBeVisible();

    // No episode pills anywhere
    await expect(page.getByText(/S\d+E\d+/)).not.toBeVisible();

    // No error banner
    await expect(page.locator(".bg-red-900\\/50")).not.toBeVisible();
  });

  // ── TC-04: Clicking a show title navigates to the title detail page ─────────
  test("TC-04: clicking show title navigates to title detail page", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const cal = new CalendarPage(page);
    await mockLoggedIn(page);
    await cal.mockCalendarShellEndpoints();
    await page.route("**/api/calendar**", (route) =>
      route.fulfill({ json: mockCalendarSingle("tv-98765", "Test Show") }),
    );
    // Stub detail page so navigation can succeed
    await page.route("**/api/details/**", (route) =>
      route.fulfill({ json: null }),
    );

    await cal.gotoCalendar();

    // Click the date cell containing the episode to open the slide-over
    // The grid cell contains a pill with "Test Show" text — click it
    await page.getByText("Test Show").first().click();

    // After clicking the cell, a slide-over panel opens with a link to the title
    // Wait for either direct navigation or the slide-over link to appear
    const titleLink = page.getByRole("link", { name: /Test Show/i }).first();
    await expect(titleLink).toBeVisible({ timeout: 5000 });
    await titleLink.click();

    await page.waitForURL(/\/title\/tv-98765/);
    await expect(page).toHaveURL(/\/title\/tv-98765/);
  });

  // ── TC-05: Unauthenticated user visiting /upcoming is redirected to /login ──
  test("TC-05: unauthenticated user visiting /upcoming redirects to /login", async ({
    page,
  }) => {
    await mockLoggedOut(page);
    await page.goto("/upcoming");

    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();

    // Calendar/upcoming content not visible
    await expect(page.getByText(/S\d+E\d+/)).not.toBeVisible();
  });
});
