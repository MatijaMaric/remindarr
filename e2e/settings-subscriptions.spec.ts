import { test, expect } from "@playwright/test";
import { mockLoggedOut, mockLoggedIn } from "./helpers";
import { SettingsSubscriptionsPage } from "./pages/settings-subscriptions-page";

test.describe.configure({ mode: "serial" });

const MOCK_PROVIDERS_RESPONSE = {
  providers: [
    { id: 8, name: "Netflix", technical_name: "netflix", icon_url: "" },
    {
      id: 9,
      name: "Amazon Prime Video",
      technical_name: "amazon",
      icon_url: "",
    },
    { id: 337, name: "Disney+", technical_name: "disney", icon_url: "" },
    { id: 350, name: "Apple TV+", technical_name: "apple", icon_url: "" },
  ],
  regionProviderIds: [8, 9],
};

async function setupSubscriptionsMocks(
  page: SettingsSubscriptionsPage["page"],
  providersResponse = MOCK_PROVIDERS_RESPONSE,
) {
  // Background shell components — must mock to prevent auth:unauthorized.
  await page.route("**/api/achievements/me**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/recommendations/count**", (route) =>
    route.fulfill({ json: { count: 0 } }),
  );
  await page.route("**/api/user/settings/subscriptions**", (route) =>
    route.fulfill({ json: { providerIds: [], onlyMine: false } }),
  );
  await page.route("**/api/titles/providers**", (route) =>
    route.fulfill({ json: providersResponse }),
  );
}

test.describe("Settings — Subscriptions tab", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Running on chromium only",
  );

  test("TC-01: Subscriptions tab loads and renders provider list", async ({
    page,
  }) => {
    const ssp = new SettingsSubscriptionsPage(page);
    await setupSubscriptionsMocks(page);
    await mockLoggedIn(page);
    await ssp.gotoSubscriptions();
    await ssp.waitForVisible(ssp.subscriptionsCard());

    // Card heading
    await expect(ssp.subscriptionsCard()).toBeVisible();

    // Region group header and providers
    await expect(ssp.regionGroupHeader()).toBeVisible();
    await expect(page.getByText("Netflix")).toBeVisible();
    await expect(page.getByText("Amazon Prime Video")).toBeVisible();

    // Other providers group header and providers
    await expect(ssp.otherGroupHeader()).toBeVisible();
    await expect(page.getByText("Disney+")).toBeVisible();
    await expect(page.getByText("Apple TV+")).toBeVisible();

    // Only show titles toggle card
    await expect(ssp.onlyMineToggle()).toBeVisible();

    // Breadcrumb shows "subscriptions"
    await expect(page.getByText("subscriptions").first()).toBeVisible();
  });

  test("TC-02: Unauthenticated user redirected to /login", async ({ page }) => {
    const ssp = new SettingsSubscriptionsPage(page);
    await mockLoggedOut(page);
    await ssp.gotoSubscriptions();
    await page.waitForURL("**/login**", { waitUntil: "commit" });

    expect(page.url()).toContain("/login");
    await expect(ssp.subscriptionsCard()).not.toBeVisible();
  });

  test("TC-03: Empty provider list shows empty-state message", async ({
    page,
  }) => {
    const ssp = new SettingsSubscriptionsPage(page);
    await setupSubscriptionsMocks(page, {
      providers: [],
      regionProviderIds: [],
    });
    await mockLoggedIn(page);
    await ssp.gotoSubscriptions();
    await ssp.waitForVisible(ssp.subscriptionsCard());

    await expect(page.getByText("No providers found.")).toBeVisible();
    await expect(page.getByText("Netflix")).not.toBeVisible();
    // Only show titles toggle card still visible
    await expect(ssp.onlyMineToggle()).toBeVisible();
  });

  test("TC-04: Checking a provider calls PUT subscriptions", async ({
    page,
  }) => {
    const ssp = new SettingsSubscriptionsPage(page);
    await setupSubscriptionsMocks(page);
    await mockLoggedIn(page);

    let putBody: Record<string, unknown> = {};
    let putCalled = 0;
    // Stateful mock: GET returns updated subscription after PUT
    let currentProviderIds: number[] = [];
    await page.route("**/api/user/settings/subscriptions", async (route) => {
      if (route.request().method() === "PUT") {
        putCalled++;
        try {
          putBody = (await route.request().postDataJSON()) as Record<
            string,
            unknown
          >;
          currentProviderIds = (putBody as { providerIds: number[] })
            .providerIds;
        } catch {
          // ignore
        }
        await route.fulfill({ json: { providerIds: currentProviderIds } });
      } else {
        await route.fulfill({
          json: { providerIds: currentProviderIds, onlyMine: false },
        });
      }
    });

    await ssp.gotoSubscriptions();
    await ssp.waitForVisible(page.getByText("Netflix"));

    // Click the Netflix label row
    await page.getByText("Netflix").click();

    // Wait for PUT to be called and UI to settle
    await page.waitForTimeout(1000);

    expect(putCalled).toBeGreaterThan(0);
    expect(putBody).toMatchObject({ providerIds: [8] });

    // Netflix checkbox is checked (amber fill visible)
    const netflixLabel = page
      .getByText("Netflix")
      .locator("xpath=ancestor::label");
    await expect(netflixLabel.locator(".border-amber-400")).toBeVisible();
  });

  test("TC-05: Unchecking a provider removes it from PUT payload", async ({
    page,
  }) => {
    const ssp = new SettingsSubscriptionsPage(page);
    await setupSubscriptionsMocks(page);
    await mockLoggedIn(page);

    // Stateful mock: GET reflects latest PUT state so refreshSubscriptions
    // keeps the UI in sync between the two clicks.
    let currentIds: number[] = [];
    const putBodies: Array<Record<string, unknown>> = [];
    await page.route("**/api/user/settings/subscriptions", async (route) => {
      if (route.request().method() === "PUT") {
        try {
          const body = (await route.request().postDataJSON()) as {
            providerIds: number[];
          };
          currentIds = body.providerIds;
          putBodies.push(body as Record<string, unknown>);
        } catch {
          // ignore
        }
        await route.fulfill({ json: { providerIds: currentIds } });
      } else {
        await route.fulfill({
          json: { providerIds: currentIds, onlyMine: false },
        });
      }
    });

    await ssp.gotoSubscriptions();
    await ssp.waitForVisible(page.getByText("Netflix"));

    // First click to check Netflix
    await page.getByText("Netflix").click();
    await page.waitForTimeout(700);

    // Second click to uncheck Netflix
    await page.getByText("Netflix").click();
    await page.waitForTimeout(700);

    // The last PUT should have empty providerIds (Netflix removed)
    expect(putBodies.length).toBeGreaterThanOrEqual(2);
    const lastPut = putBodies[putBodies.length - 1];
    expect(lastPut).toMatchObject({ providerIds: [] });
  });

  test("TC-06: 'Only show titles on my services' toggle calls PUT only-mine", async ({
    page,
  }) => {
    const ssp = new SettingsSubscriptionsPage(page);
    await setupSubscriptionsMocks(page);
    await mockLoggedIn(page);

    let putBody: Record<string, unknown> = {};
    let putCalled = 0;
    let currentOnlyMine = false;

    // Override the subscriptions GET to return stateful onlyMine value
    // (registered after setupSubscriptionsMocks so it has higher priority)
    await page.route("**/api/user/settings/subscriptions**", async (route) => {
      if (route.request().method() === "PUT") {
        // only-mine endpoint — extract new value
        putCalled++;
        try {
          putBody = (await route.request().postDataJSON()) as Record<
            string,
            unknown
          >;
          currentOnlyMine = (putBody as { onlyMine: boolean }).onlyMine;
        } catch {
          // ignore
        }
        await route.fulfill({ json: { onlyMine: currentOnlyMine } });
      } else {
        await route.fulfill({
          json: { providerIds: [], onlyMine: currentOnlyMine },
        });
      }
    });

    await ssp.gotoSubscriptions();
    await ssp.waitForVisible(ssp.onlyMineToggle());

    await ssp.onlyMineToggle().click();

    await page.waitForTimeout(1000);

    expect(putCalled).toBe(1);
    expect(putBody).toMatchObject({ onlyMine: true });

    // Toggle is now on
    await expect(ssp.onlyMineToggle()).toHaveAttribute("aria-checked", "true");
  });

  test("TC-07: Provider save error shows error message", async ({ page }) => {
    const ssp = new SettingsSubscriptionsPage(page);
    await setupSubscriptionsMocks(page);
    await mockLoggedIn(page);

    // Override subscriptions PUT with a 500 error (registered last = highest priority)
    await page.route("**/api/user/settings/subscriptions", async (route) => {
      if (route.request().method() === "PUT") {
        await route.fulfill({
          status: 500,
          json: { error: "Server error" },
        });
      } else {
        await route.fulfill({
          json: { providerIds: [], onlyMine: false },
        });
      }
    });

    await ssp.gotoSubscriptions();
    await ssp.waitForVisible(page.getByText("Netflix"));

    await page.getByText("Netflix").click();

    // Wait for error message
    await expect(
      page.getByText("Failed to save. Please try again."),
    ).toBeVisible({ timeout: 10000 });

    // Netflix checkbox reverted to unchecked (no amber fill)
    const netflixLabel = page
      .getByText("Netflix")
      .locator("xpath=ancestor::label");
    await expect(netflixLabel.locator(".border-amber-400")).not.toBeVisible();
  });

  test("TC-08: Region vs. other providers grouping is correct", async ({
    page,
  }) => {
    const ssp = new SettingsSubscriptionsPage(page);
    await setupSubscriptionsMocks(page, {
      providers: [
        { id: 8, name: "Netflix", technical_name: "netflix", icon_url: "" },
        {
          id: 9,
          name: "Amazon Prime Video",
          technical_name: "amazon",
          icon_url: "",
        },
        {
          id: 337,
          name: "Disney+",
          technical_name: "disney",
          icon_url: "",
        },
      ],
      regionProviderIds: [8],
    });
    await mockLoggedIn(page);
    await ssp.gotoSubscriptions();
    await ssp.waitForVisible(ssp.regionGroupHeader());

    // Region group: only Netflix
    const regionSection = page
      .getByText("My Region", { exact: true })
      .first()
      .locator("xpath=following-sibling::div[1]");
    await expect(regionSection.getByText("Netflix")).toBeVisible();
    await expect(
      regionSection.getByText("Amazon Prime Video"),
    ).not.toBeVisible();

    // Other providers group: Amazon and Disney+
    const otherSection = page
      .getByText("Other", { exact: true })
      .first()
      .locator("xpath=following-sibling::div[1]");
    await expect(otherSection.getByText("Amazon Prime Video")).toBeVisible();
    await expect(otherSection.getByText("Disney+")).toBeVisible();
    await expect(otherSection.getByText("Netflix")).not.toBeVisible();
  });
});
