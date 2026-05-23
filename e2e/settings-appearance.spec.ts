import { test, expect } from "@playwright/test";
import { mockLoggedOut, mockLoggedIn } from "./helpers";
import { SettingsAppearancePage } from "./pages/settings-appearance-page";

test.describe.configure({ mode: "serial" });

const MOCK_APPEARANCE = {
  themeVariant: "dark",
  accentColor: "amber",
  density: "comfortable",
  reduceMotion: 0,
  highContrast: 0,
  hideEpisodeSpoilers: 0,
  autoplayTrailers: 0,
};

const MOCK_HOMEPAGE_LAYOUT = {
  homepage_layout: [
    { id: "up_next", enabled: true },
    { id: "unwatched", enabled: true },
    { id: "recommendations", enabled: false },
  ],
};

const MOCK_CROWDED_WEEK = {
  crowdedWeekBadgeEnabled: 1,
  crowdedWeekThreshold: 5,
};

async function setupAppearanceMocks(page: SettingsAppearancePage["page"]) {
  // Background shell components — must mock to prevent auth:unauthorized.
  await page.route("**/api/achievements/me**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/recommendations/count**", (route) =>
    route.fulfill({ json: { count: 0 } }),
  );
  await page.route("**/api/user/settings/subscriptions**", (route) =>
    route.fulfill({ json: { providerIds: [] } }),
  );
  // Appearance tab endpoints
  await page.route("**/api/user/settings/appearance", (route) =>
    route.fulfill({ json: MOCK_APPEARANCE }),
  );
  await page.route("**/api/user/settings/homepage-layout", (route) =>
    route.fulfill({ json: MOCK_HOMEPAGE_LAYOUT }),
  );
  await page.route("**/api/user/settings/crowded-weeks", (route) =>
    route.fulfill({ json: MOCK_CROWDED_WEEK }),
  );
}

test.describe("Settings — Appearance tab", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Running on chromium only",
  );

  test("TC-01: Appearance tab loads with theme and accent controls", async ({
    page,
  }) => {
    const sap = new SettingsAppearancePage(page);
    await setupAppearanceMocks(page);
    await mockLoggedIn(page);
    await sap.gotoAppearance();
    await sap.waitForVisible(sap.heading());

    await expect(sap.themeSection()).toBeVisible();
    await expect(sap.accentSection()).toBeVisible();
    await expect(sap.displayPrefsSection()).toBeVisible();
    await expect(sap.homepageLayoutSection()).toBeVisible();

    // Breadcrumb shows "Appearance"
    await expect(page.getByText("Appearance").first()).toBeVisible();
  });

  test("TC-02: Unauthenticated user redirected to /login", async ({ page }) => {
    const sap = new SettingsAppearancePage(page);
    await mockLoggedOut(page);
    await sap.gotoAppearance();
    await page.waitForURL("**/login**", { waitUntil: "commit" });

    expect(page.url()).toContain("/login");
    await expect(sap.themeSection()).not.toBeVisible();
  });

  test("TC-03: Theme picker buttons are rendered", async ({ page }) => {
    const sap = new SettingsAppearancePage(page);
    await setupAppearanceMocks(page);
    await mockLoggedIn(page);
    await sap.gotoAppearance();
    await sap.waitForVisible(sap.themeSection());

    // ThemePicker renders at least Dark and Light buttons
    await expect(
      page.getByRole("button", { name: /dark/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /light/i }).first(),
    ).toBeVisible();
  });

  test("TC-04: Accent colour selection sends PUT to appearance API", async ({
    page,
  }) => {
    const sap = new SettingsAppearancePage(page);
    let putBody = "";
    await page.route("**/api/achievements/me**", (route) =>
      route.fulfill({ json: [] }),
    );
    await page.route("**/api/recommendations/count**", (route) =>
      route.fulfill({ json: { count: 0 } }),
    );
    await page.route("**/api/user/settings/subscriptions**", (route) =>
      route.fulfill({ json: { providerIds: [] } }),
    );
    await page.route("**/api/user/settings/appearance", async (route) => {
      if (route.request().method() === "PUT") {
        putBody = route.request().postData() ?? "";
        await route.fulfill({
          json: { ...MOCK_APPEARANCE, accentColor: "cobalt" },
        });
      } else {
        await route.fulfill({ json: MOCK_APPEARANCE });
      }
    });
    await page.route("**/api/user/settings/homepage-layout", (route) =>
      route.fulfill({ json: MOCK_HOMEPAGE_LAYOUT }),
    );
    await page.route("**/api/user/settings/crowded-weeks", (route) =>
      route.fulfill({ json: MOCK_CROWDED_WEEK }),
    );
    await mockLoggedIn(page);
    await sap.gotoAppearance();
    await sap.waitForVisible(sap.accentSection());

    // Click a non-current accent colour (Cobalt)
    await page
      .getByRole("button", { name: /cobalt/i })
      .first()
      .click();
    await page.waitForTimeout(500);

    expect(putBody).toContain("cobalt");
    // Saved indicator appears
    await expect(page.getByText("Saved").first()).toBeVisible();
  });

  test("TC-05: Display preferences toggle fires PUT", async ({ page }) => {
    const sap = new SettingsAppearancePage(page);
    let putBody = "";
    await page.route("**/api/achievements/me**", (route) =>
      route.fulfill({ json: [] }),
    );
    await page.route("**/api/recommendations/count**", (route) =>
      route.fulfill({ json: { count: 0 } }),
    );
    await page.route("**/api/user/settings/subscriptions**", (route) =>
      route.fulfill({ json: { providerIds: [] } }),
    );
    await page.route("**/api/user/settings/appearance", async (route) => {
      if (route.request().method() === "PUT") {
        putBody = route.request().postData() ?? "";
        await route.fulfill({
          json: { ...MOCK_APPEARANCE, reduceMotion: 1 },
        });
      } else {
        await route.fulfill({ json: MOCK_APPEARANCE });
      }
    });
    await page.route("**/api/user/settings/homepage-layout", (route) =>
      route.fulfill({ json: MOCK_HOMEPAGE_LAYOUT }),
    );
    await page.route("**/api/user/settings/crowded-weeks", (route) =>
      route.fulfill({ json: MOCK_CROWDED_WEEK }),
    );
    await mockLoggedIn(page);
    await sap.gotoAppearance();
    await sap.waitForVisible(sap.displayPrefsSection());

    // Toggle the "Reduce motion" switch
    const toggle = page.getByRole("switch", { name: /reduce motion/i });
    await sap.waitForVisible(toggle);
    await toggle.click();
    await page.waitForTimeout(500);

    expect(putBody).toContain("reduceMotion");
  });

  test("TC-06: Homepage layout section renders section rows", async ({
    page,
  }) => {
    const sap = new SettingsAppearancePage(page);
    await setupAppearanceMocks(page);
    await mockLoggedIn(page);
    await sap.gotoAppearance();
    await sap.waitForVisible(sap.homepageLayoutSection());

    // Three sections should be rendered (labels from i18n)
    await expect(page.getByText("Up Next").first()).toBeVisible();
    await expect(page.getByText("Unwatched Episodes").first()).toBeVisible();
    await expect(page.getByText("Recommended for You").first()).toBeVisible();

    // Enabled rows have a "Hide section" button
    await expect(
      page.getByRole("button", { name: /hide section/i }).first(),
    ).toBeVisible();
  });

  test("TC-07: Homepage layout toggle fires PUT", async ({ page }) => {
    const sap = new SettingsAppearancePage(page);
    let putBody = "";
    await page.route("**/api/achievements/me**", (route) =>
      route.fulfill({ json: [] }),
    );
    await page.route("**/api/recommendations/count**", (route) =>
      route.fulfill({ json: { count: 0 } }),
    );
    await page.route("**/api/user/settings/subscriptions**", (route) =>
      route.fulfill({ json: { providerIds: [] } }),
    );
    await page.route("**/api/user/settings/appearance", (route) =>
      route.fulfill({ json: MOCK_APPEARANCE }),
    );
    await page.route("**/api/user/settings/homepage-layout", async (route) => {
      if (route.request().method() === "PUT") {
        putBody = route.request().postData() ?? "";
        await route.fulfill({
          json: {
            homepage_layout: [
              { id: "up_next", enabled: false },
              { id: "unwatched", enabled: true },
              { id: "recommendations", enabled: false },
            ],
          },
        });
      } else {
        await route.fulfill({ json: MOCK_HOMEPAGE_LAYOUT });
      }
    });
    await page.route("**/api/user/settings/crowded-weeks", (route) =>
      route.fulfill({ json: MOCK_CROWDED_WEEK }),
    );
    await mockLoggedIn(page);
    await sap.gotoAppearance();
    await sap.waitForVisible(sap.homepageLayoutSection());

    // Click the hide button on the first (up_next) row
    const hideBtn = page.getByRole("button", { name: /hide section/i }).first();
    await sap.waitForVisible(hideBtn);
    await hideBtn.click();
    await page.waitForTimeout(500);

    expect(putBody).toContain("up_next");
  });

  test("TC-08: Crowded week badge toggle fires PUT", async ({ page }) => {
    const sap = new SettingsAppearancePage(page);
    let putBody = "";
    await page.route("**/api/achievements/me**", (route) =>
      route.fulfill({ json: [] }),
    );
    await page.route("**/api/recommendations/count**", (route) =>
      route.fulfill({ json: { count: 0 } }),
    );
    await page.route("**/api/user/settings/subscriptions**", (route) =>
      route.fulfill({ json: { providerIds: [] } }),
    );
    await page.route("**/api/user/settings/appearance", (route) =>
      route.fulfill({ json: MOCK_APPEARANCE }),
    );
    await page.route("**/api/user/settings/homepage-layout", (route) =>
      route.fulfill({ json: MOCK_HOMEPAGE_LAYOUT }),
    );
    await page.route("**/api/user/settings/crowded-weeks", async (route) => {
      if (route.request().method() === "PUT") {
        putBody = route.request().postData() ?? "";
        await route.fulfill({
          json: { crowdedWeekBadgeEnabled: 0, crowdedWeekThreshold: 5 },
        });
      } else {
        await route.fulfill({ json: MOCK_CROWDED_WEEK });
      }
    });
    await mockLoggedIn(page);
    await sap.gotoAppearance();
    await sap.waitForVisible(sap.crowdedWeekSection());

    // Click the "Show crowded week badges" toggle.
    // The CrowdedWeekSection renders a custom button with aria-pressed.
    const toggle = page
      .getByText(/show crowded week badges/i)
      .locator("+ button");
    await sap.waitForVisible(toggle);
    await toggle.click();
    await page.waitForTimeout(500);

    expect(putBody).toContain("crowdedWeekBadgeEnabled");
  });
});
