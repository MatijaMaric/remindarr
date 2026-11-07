import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  mockLoggedIn,
  MOCK_SHOW,
  MOCK_SHOW_DETAILS,
  MOCK_MOVIE_DETAILS,
  MOCK_EPISODE,
} from "./helpers";
import { BasePage } from "./pages/base-page";

const title = {
  ...MOCK_SHOW,
  id: "tv-tt9876543",
  is_tracked: true,
  title: "A long library title with several words",
  tags: ["weekend"],
  user_status: "watching",
  offers: [],
};

class ReviewPage extends BasePage {
  async open(path: string) {
    await this.goto(path);
  }
  async assertFits(locator: Locator) {
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(
      this.page.viewportSize()!.width + 1,
    );
  }
}

async function setup(page: Page) {
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  // Firefox/WebKit report Notification.permission "default", which shows the
  // push prompt above every page; Chromium headless reports "denied".
  await page.addInitScript(() =>
    localStorage.setItem("notification-prompt-dismissed", "1"),
  );
  await mockLoggedIn(page);
  await page.route("**/api/auth/passkey/list-user-passkeys", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/user/me/activity-settings", (route) =>
    route.fulfill({ json: { enabled: false, kind_visibility: {} } }),
  );
  await page.route("**/api/user/settings/subscriptions**", (route) =>
    route.fulfill({ json: { providerIds: [], onlyMine: false } }),
  );
  await page.route("**/api/user/settings/advisory**", (route) =>
    route.fulfill({ json: { level: "none", allowlist: [] } }),
  );
  await page.route("**/api/track", (route) =>
    route.fulfill({ json: { titles: [title], count: 1 } }),
  );
  await page.route("**/api/suggestions**", (route) =>
    route.fulfill({ json: { flat: [], groups: [] } }),
  );
  await page.route("**/api/details/show/**", (route) =>
    route.fulfill({ json: { ...MOCK_SHOW_DETAILS, title, country: "HR" } }),
  );
  await page.route("**/api/details/movie/**", (route) =>
    route.fulfill({ json: { ...MOCK_MOVIE_DETAILS, country: "HR" } }),
  );
  await page.route("**/api/details/**/suggestions**", (route) =>
    route.fulfill({ json: { titles: [] } }),
  );
  await page.route("**/api/ratings/**", (route) =>
    route.fulfill({
      json: {
        aggregated: { HATE: 0, DISLIKE: 0, LIKE: 0, LOVE: 0 },
        user_rating: null,
        friends_ratings: [],
      },
    }),
  );
  await page.route("**/api/titles/providers", (route) =>
    route.fulfill({
      json: {
        providers: [{ id: 8, name: "Netflix" }],
        regionProviderIds: [8],
        country: "HR",
      },
    }),
  );
  await page.route("**/api/user/me/profile", (route) =>
    route.fulfill({
      json: {
        display_name: "Test User",
        country_code: "US",
        bio: null,
        locale: "en",
      },
    }),
  );
  await page.route("**/api/calendar**", (route) =>
    route.fulfill({
      json: {
        titles: [],
        episodes:
          new URL(route.request().url()).searchParams.get("month") ===
          MOCK_EPISODE.air_date.slice(0, 7)
            ? [
                { ...MOCK_EPISODE, title_id: title.id },
                {
                  ...MOCK_EPISODE,
                  id: 102,
                  title_id: title.id,
                  episode_number: 2,
                  name: "Episode Two",
                },
                {
                  ...MOCK_EPISODE,
                  id: 103,
                  title_id: "tv-other",
                  show_title: "Another Show",
                  name: "Another Pilot",
                },
              ]
            : [],
      },
    }),
  );
}

test.beforeEach(async ({ page }) => {
  await setup(page);
});

test("header, compact rows and selection actions fit at phone, tablet and desktop widths", async ({
  page,
}) => {
  const review = new ReviewPage(page);
  for (const width of [320, 390, 640, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await review.open("/tracked");
    await review.assertFits(
      page.getByRole("link", { name: title.title, exact: true }),
    );
    const actions = page.getByRole("button", {
      name: `More actions for ${title.title}`,
    });
    await review.assertFits(actions);
    await actions.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await review.assertFits(page.getByRole("textbox", { name: /tag/i }));
    await page.keyboard.press("Escape");
    await expect(actions).toBeFocused();
    await page.getByRole("button", { name: "Select", exact: true }).click();
    const checkbox = page.getByRole("checkbox", {
      name: `Select ${title.title}`,
    });
    await review.assertFits(checkbox);
    await checkbox.focus();
    await page.keyboard.press("Space");
    await expect(checkbox).toBeChecked();
    await page.keyboard.press("Escape");
    if (width < 1280) {
      await review.assertFits(
        page.getByRole("link", { name: "More navigation options" }),
      );
      await page.getByRole("link", { name: "More navigation options" }).click();
      await expect(page).toHaveURL(/\/more$/);
      await review.assertFits(page.getByRole("link", { name: /Settings/ }));
      await review.assertFits(
        page.getByRole("button", { name: /Sign out|Log out/i }),
      );
      // /more redirects to /reels once the viewport is no longer mobile, which
      // would race the next iteration's goto after the resize.
      await page.goBack();
      await expect(page).toHaveURL(/\/tracked$/);
    } else {
      const nav = page.getByRole("navigation", { name: "Main navigation" });
      await review.assertFits(nav.getByRole("link", { name: "Settings" }));
      await review.assertFits(
        nav.getByRole("button", { name: /Log out|Logout|Sign out/i }),
      );
    }
  }
});

test("short phone hero exposes actions and light theme has readable hero, metadata and navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() =>
    localStorage.setItem("remindarr-theme", "light"),
  );
  const review = new ReviewPage(page);
  await review.open(`/title/${title.id}`);
  await expect(
    page.getByRole("heading", { name: "Test Show", exact: true }),
  ).toBeVisible();
  const track = page.getByRole("button", { name: "In watchlist", exact: true });
  await review.assertFits(track);
  expect((await track.boundingBox())!.y).toBeLessThan(480);
  // axe resolves a second Playwright version but uses the shared Page API.
  const results = await new AxeBuilder({
    page: page as unknown as ConstructorParameters<
      typeof AxeBuilder
    >[0]["page"],
  })
    .withRules(["color-contrast"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({
    path: "test-results/remediation-short-light.png",
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await review.assertFits(
    page.getByRole("heading", { name: "Test Show", exact: true }),
  );
  await track.scrollIntoViewIfNeeded();
  await review.assertFits(track);
  const longName = `${title.title}: A Second Chapter with a Very Long Subtitle`;
  await page.route("**/api/details/show/tv-tt9876543", (route) =>
    route.fulfill({
      json: {
        ...MOCK_SHOW_DETAILS,
        title,
        country: "HR",
        tmdb: { ...MOCK_SHOW_DETAILS.tmdb, name: longName },
      },
    }),
  );
  await page.reload();
  const heading = page.getByRole("heading", { name: longName, exact: true });
  await expect(heading).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await review.assertFits(heading);
  const headingBox = await heading.boundingBox();
  expect((await track.boundingBox())!.y).toBeGreaterThan(
    headingBox!.y + headingBox!.height,
  );
});

test("tablet Settings keeps full-width forms and exposes the effective region", async ({
  page,
}) => {
  const review = new ReviewPage(page);
  for (const width of [640, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await review.open("/settings?tab=subscriptions");
    await expect(page.getByText("Streaming region: HR")).toBeVisible();
    await review.assertFits(page.getByRole("checkbox", { name: "Netflix" }));
    const tab = page.getByRole("tab", { name: "Subscriptions", exact: true });
    await expect(tab).toBeVisible();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("link", { name: "Streaming region configuration" }),
    ).toHaveAttribute("href", /#streaming-region$/);
    await page.getByRole("tab", { name: "Account", exact: true }).click();
    await expect(
      page.getByText(
        "Profile country is biographical. It does not change streaming availability.",
      ),
    ).toBeVisible();
    await review.assertFits(page.getByRole("combobox", { name: "Country" }));
    await expect(page.getByRole("combobox", { name: "Country" })).toHaveValue(
      "US",
    );
  }
});

test("mobile library gives space to titles and uses two legible grid columns", async ({
  page,
}) => {
  const review = new ReviewPage(page);
  await review.open("/tracked");
  const link = page.getByRole("link", { name: title.title, exact: true });
  await expect(link).toBeVisible();
  expect((await link.boundingBox())!.y).toBeLessThan(500);
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  const grid = page.getByTestId("title-grid");
  expect(
    await grid.evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
    ),
  ).toBe(2);
  await page.screenshot({
    path: "test-results/remediation-library.png",
    fullPage: true,
  });
});

test("mobile agenda keeps multiple shows and episodes compact and actionable", async ({
  page,
}) => {
  const review = new ReviewPage(page);
  await review.open("/calendar?view=agenda");
  const episode = page.getByRole("link", { name: /S01E02.*Episode Two/ });
  await expect(episode).toBeVisible();
  await review.assertFits(episode);
  await expect(
    page.getByRole("link", { name: "Another Show", exact: true }),
  ).toBeVisible();
  const watched = page.getByRole("button", {
    name: "Mark as watched",
    exact: true,
  });
  await expect(watched).toHaveCount(3);
  expect((await watched.first().boundingBox())!.height).toBeGreaterThanOrEqual(
    40,
  );
  await page.screenshot({
    path: "test-results/remediation-agenda.png",
    fullPage: true,
  });
});

test("library filters survive detail navigation and reload", async ({
  page,
}) => {
  const review = new ReviewPage(page);
  await review.open("/tracked?tag=weekend&status=watching&sort=title");
  await page
    .getByRole("searchbox", { name: "Search your library" })
    .fill("long");
  await page.getByRole("link", { name: title.title, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Test Show", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("searchbox")).toHaveValue("long");
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Filter by tag" }),
  ).toHaveValue("weekend");
  await expect(
    page.getByRole("combobox", { name: "Sort titles by" }),
  ).toHaveValue("title");
  await expect(page.getByRole("tab", { name: /^Watching/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("light Movie, Tracked, Calendar and Settings remain readable on narrow phones", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("remindarr-theme", "light"),
  );
  const review = new ReviewPage(page);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of [
      "/title/tt1234567",
      "/tracked",
      "/calendar?view=agenda",
      "/settings?tab=subscriptions",
    ]) {
      await review.open(path);
      await expect(
        page.getByRole("navigation", { name: "Mobile navigation" }),
      ).toBeVisible();
      await expect(page.getByRole("main")).not.toContainText("Loading...");
      const results = await new AxeBuilder({
        page: page as unknown as ConstructorParameters<
          typeof AxeBuilder
        >[0]["page"],
      })
        .withRules(["color-contrast"])
        .analyze();
      expect(results.violations, `${width}px ${path}`).toEqual([]);
    }
  }
});

// ── #1172: safe areas, text scaling, density, toasts and large libraries ──
// Runs in every project from playwright.remediation.config.ts (Chromium,
// Firefox, WebKit and phone emulation). Chromium-only steps use CDP to emulate
// physical safe-area insets and the browser's default font size setting.

const CORE_ROUTES = [
  "/tracked",
  "/calendar?view=agenda",
  "/settings?tab=subscriptions",
  `/title/${title.id}`,
];

async function useDensity(page: Page, density: string) {
  await page.route("**/api/user/settings/appearance", (route) =>
    route.fulfill({
      json: {
        themeVariant: "dark",
        accentColor: "amber",
        density,
        reduceMotion: 0,
        highContrast: 0,
        hideEpisodeSpoilers: 0,
        autoplayTrailers: 0,
      },
    }),
  );
}

async function expectNoHorizontalScroll(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, label).toBeLessThanOrEqual(1);
}

function bottomOf(box: { y: number; height: number } | null) {
  return box!.y + box!.height;
}

test("core routes reflow at 320px with 200% text in every density", async ({
  page,
}) => {
  // 320 CSS px is 1280px at 400% zoom (WCAG 1.4.10 reflow).
  await page.setViewportSize({ width: 320, height: 640 });
  const review = new ReviewPage(page);
  for (const density of ["comfortable", "cozy", "compact"]) {
    await useDensity(page, density);
    for (const path of CORE_ROUTES) {
      await review.open(path);
      await expect(page.locator("html")).toHaveAttribute(
        "data-density",
        density,
      );
      await expect(page.getByRole("main")).not.toContainText("Loading...");
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      await expectNoHorizontalScroll(page, `${density} ${path}`);
      const nav = page.getByRole("navigation", { name: "Mobile navigation" });
      for (const link of await nav.getByRole("link").all()) {
        await review.assertFits(link);
        const box = (await link.boundingBox())!;
        // WCAG 2.2 2.5.8 minimum target size.
        expect(box.height, `${density} ${path}`).toBeGreaterThanOrEqual(24);
        expect(box.width, `${density} ${path}`).toBeGreaterThanOrEqual(24);
      }
    }
  }
});

test("density scales from the browser's default font size instead of replacing it", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Default font size needs CDP");
  const cdp = await page.context().newCDPSession(page);
  // Equivalent of choosing "Very large" font size in browser settings.
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 32 } });
  const review = new ReviewPage(page);
  for (const [density, px] of [
    ["comfortable", 32],
    ["cozy", 29],
    ["compact", 26],
  ] as const) {
    await useDensity(page, density);
    await review.open("/tracked");
    await expect(page.locator("html")).toHaveAttribute("data-density", density);
    expect(
      await page.evaluate(() =>
        parseFloat(getComputedStyle(document.documentElement).fontSize),
      ),
    ).toBeCloseTo(px, 0);
    await expectNoHorizontalScroll(page, density);
  }
});

test("mobile navigation clears the home-indicator safe area", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Safe-area emulation needs CDP");
  const cdp = await page.context().newCDPSession(page);
  // iPhone-style insets: notch on top, home indicator at the bottom.
  await cdp.send("Emulation.setSafeAreaInsetsOverride", {
    insets: { top: 47, bottom: 34, left: 0, right: 0 },
  });
  const review = new ReviewPage(page);
  await review.open("/tracked");
  const nav = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(nav).toBeVisible();
  const height = page.viewportSize()!.height;
  expect(bottomOf(await nav.boundingBox())).toBeLessThanOrEqual(height - 34);
});

test("toasts never cover the mobile navigation or the desktop corner", async ({
  page,
}) => {
  await page.route("**/api/watched/**", (route) =>
    route.fulfill({ status: 500, json: { error: "boom" } }),
  );
  const review = new ReviewPage(page);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await review.open("/calendar?view=agenda");
    await page
      .getByRole("button", { name: "Mark as watched", exact: true })
      .first()
      .click();
    const toast = page.getByRole("listitem").filter({
      hasText: "Failed to update watched status",
    });
    await expect(toast.first()).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Mobile navigation" });
    // Polling waits out the slide-in animation.
    const limit =
      width < 1280 ? (await nav.boundingBox())!.y : page.viewportSize()!.height;
    await expect
      .poll(async () => bottomOf(await toast.first().boundingBox()), {
        message: `${width}px`,
      })
      .toBeLessThanOrEqual(limit);
    if (width >= 1280) await expect(nav).toBeHidden();
  }
});

test("a 500-title library renders and scrolls without layout overflow", async ({
  page,
}) => {
  const many = Array.from({ length: 500 }, (_, i) => ({
    ...title,
    id: `tv-tt${1_000_000 + i}`,
    title: `Library title number ${i}`,
  }));
  await page.route("**/api/track", (route) =>
    route.fulfill({ json: { titles: many, count: many.length } }),
  );
  const review = new ReviewPage(page);
  const started = Date.now();
  await review.open("/tracked");
  await expect(
    page.getByRole("link", { name: "Library title number 0", exact: true }),
  ).toBeVisible();
  const renderMs = Date.now() - started;
  const nodes = await page.evaluate(
    () => document.querySelectorAll("*").length,
  );
  test.info().annotations.push({
    type: "large-library",
    description: `500 titles: first row after ${renderMs}ms, ${nodes} DOM nodes`,
  });
  // Generous ceiling: catches pathological regressions, not a perf budget.
  expect(renderMs).toBeLessThan(10_000);
  await expectNoHorizontalScroll(page, "500 titles");
  const last = page.getByRole("link", {
    name: "Library title number 499",
    exact: true,
  });
  await last.scrollIntoViewIfNeeded();
  await review.assertFits(last);
});
