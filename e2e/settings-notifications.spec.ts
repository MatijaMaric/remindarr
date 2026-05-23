import { test, expect } from "@playwright/test";
import { mockLoggedOut, mockLoggedIn } from "./helpers";
import { SettingsNotificationsPage } from "./pages/settings-notifications-page";

test.describe.configure({ mode: "serial" });

const MOCK_NOTIFIER = {
  id: "notifier-1",
  user_id: "user-1",
  provider: "discord",
  name: "Discord",
  config: { webhookUrl: "https://discord.com/api/webhooks/123/abc" },
  notify_time: "09:00",
  timezone: "UTC",
  enabled: true,
  last_sent_date: null,
  digest_mode: null,
  digest_day: null,
  streaming_alerts_enabled: true,
  quiet_hours_start: null,
  quiet_hours_end: null,
  quiet_hours_days: null,
  leaving_soon_alerts_enabled: true,
  friend_activity_alerts_enabled: false,
  achievements_enabled: false,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const MOCK_PROVIDERS = ["discord", "telegram", "ntfy", "gotify", "webhook"];

const MOCK_DEPARTURE_ALERTS = {
  streamingDeparturesEnabled: false,
  departureAlertLeadDays: 7,
};

async function setupNotificationsMocks(
  page: SettingsNotificationsPage["page"],
  notifiers = [MOCK_NOTIFIER],
) {
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
  // Notifications tab endpoints — register general route FIRST (lowest priority),
  // specific sub-routes LAST (highest priority) due to Playwright LIFO ordering.
  await page.route("**/api/notifiers**", (route) =>
    route.fulfill({ json: { notifiers } }),
  );
  await page.route("**/api/notifiers/*/history**", (route) =>
    route.fulfill({ json: { rows: [], successRate: 100 } }),
  );
  await page.route("**/api/notifiers/providers**", (route) =>
    route.fulfill({ json: { providers: MOCK_PROVIDERS } }),
  );
  await page.route("**/api/user/settings/departure-alerts**", (route) =>
    route.fulfill({ json: MOCK_DEPARTURE_ALERTS }),
  );
}

test.describe("Settings — Notifications tab", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Running on chromium only",
  );

  test("TC-01: Notifications tab loads notifier list", async ({ page }) => {
    const snp = new SettingsNotificationsPage(page);
    await setupNotificationsMocks(page);
    await mockLoggedIn(page);
    await snp.gotoNotifications();
    await snp.waitForVisible(snp.notifiersSection());

    // Notifiers card is visible
    await expect(snp.notifiersSection()).toBeVisible();

    // Discord notifier row is rendered
    await expect(page.getByText("Discord").first()).toBeVisible();

    // Status pills on the Discord row
    await expect(page.getByText("Enabled").first()).toBeVisible();
    await expect(page.getByText("Streaming alerts").first()).toBeVisible();

    // Time and Frequency key-values
    await expect(page.getByText("09:00 UTC")).toBeVisible();
    await expect(page.getByText("Daily")).toBeVisible();

    // Add notifier button
    await expect(snp.addNotifierButton()).toBeVisible();

    // Breadcrumb shows "notifications"
    await expect(page.getByText("notifications").first()).toBeVisible();
  });

  test("TC-02: Unauthenticated user redirected to /login", async ({ page }) => {
    const snp = new SettingsNotificationsPage(page);
    await mockLoggedOut(page);
    await snp.gotoNotifications();
    await page.waitForURL("**/login**", { waitUntil: "commit" });

    expect(page.url()).toContain("/login");
    await expect(snp.notifiersSection()).not.toBeVisible();
  });

  test("TC-03: Empty notifier list shows 'No notifiers configured'", async ({
    page,
  }) => {
    const snp = new SettingsNotificationsPage(page);
    await setupNotificationsMocks(page, []);
    await mockLoggedIn(page);
    await snp.gotoNotifications();
    await snp.waitForVisible(snp.notifiersSection());

    await expect(page.getByText("No notifiers configured.")).toBeVisible();
    // No Discord row
    await expect(page.getByText("Discord").first()).not.toBeVisible();
    // Add notifier button still present
    await expect(snp.addNotifierButton()).toBeVisible();
  });

  test("TC-04: Add notifier form opens and renders Discord fields", async ({
    page,
  }) => {
    const snp = new SettingsNotificationsPage(page);
    await setupNotificationsMocks(page, []);
    await mockLoggedIn(page);
    await snp.gotoNotifications();
    await snp.waitForVisible(snp.addNotifierButton());

    await snp.addNotifierButton().click();

    // Form card heading appears
    await expect(page.getByText("Add a notifier").first()).toBeVisible();

    // Provider selector buttons
    await expect(page.getByRole("button", { name: "Discord" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Telegram" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ntfy" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Gotify" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Webhook" })).toBeVisible();

    // Discord form fields
    await expect(page.getByLabel(/webhook url/i)).toBeVisible();
    await expect(page.locator('input[type="time"]').first()).toBeVisible();

    // Frequency radio cards
    await expect(page.getByText("Daily digest")).toBeVisible();
    await expect(page.getByText("Weekly digest")).toBeVisible();
    await expect(page.getByText("Off · per-event")).toBeVisible();

    // Submit and cancel buttons
    await expect(
      page.getByRole("button", { name: /create notifier/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible();
  });

  test("TC-05: Create notifier submits correct payload for Discord", async ({
    page,
  }) => {
    const snp = new SettingsNotificationsPage(page);
    await setupNotificationsMocks(page, []);
    await mockLoggedIn(page);

    let postBody: Record<string, unknown> = {};
    let postCalled = 0;

    // Intercept POST /api/notifiers (must be registered before the general GET mock above)
    await page.route("**/api/notifiers", async (route) => {
      if (route.request().method() === "POST") {
        postCalled++;
        try {
          postBody = (await route.request().postDataJSON()) as Record<
            string,
            unknown
          >;
        } catch {
          // ignore
        }
        await route.fulfill({
          json: {
            notifier: {
              id: "notifier-new",
              user_id: "user-1",
              provider: "discord",
              name: "Discord",
              config: {
                webhookUrl: "https://discord.com/api/webhooks/999/xyz",
              },
              notify_time: "08:00",
              timezone: "UTC",
              enabled: true,
              last_sent_date: null,
              digest_mode: null,
              digest_day: null,
              streaming_alerts_enabled: true,
              quiet_hours_start: null,
              quiet_hours_end: null,
              quiet_hours_days: null,
              leaving_soon_alerts_enabled: true,
              friend_activity_alerts_enabled: false,
              achievements_enabled: false,
              created_at: "2024-01-01T00:00:00Z",
              updated_at: "2024-01-01T00:00:00Z",
            },
          },
        });
      } else {
        await route.fulfill({ json: { notifiers: [] } });
      }
    });

    await snp.gotoNotifications();
    await snp.waitForVisible(snp.addNotifierButton());
    await snp.addNotifierButton().click();

    // Fill webhook URL
    await page
      .getByLabel(/webhook url/i)
      .fill("https://discord.com/api/webhooks/999/xyz");

    // Click Create notifier
    await page.getByRole("button", { name: /create notifier/i }).click();

    // Wait for success message
    await expect(page.getByText("Notifier created")).toBeVisible({
      timeout: 10000,
    });

    // POST was called once with correct provider
    expect(postCalled).toBe(1);
    expect(postBody).toMatchObject({
      provider: "discord",
      config: expect.objectContaining({
        webhookUrl: "https://discord.com/api/webhooks/999/xyz",
      }),
    });

    // Form closes
    await expect(
      page.getByRole("button", { name: /create notifier/i }),
    ).not.toBeVisible();
  });

  test("TC-06: Test button on existing notifier calls test endpoint", async ({
    page,
  }) => {
    const snp = new SettingsNotificationsPage(page);
    await setupNotificationsMocks(page);
    await mockLoggedIn(page);

    let testCalled = 0;
    await page.route("**/api/notifiers/notifier-1/test**", async (route) => {
      testCalled++;
      await route.fulfill({
        json: { success: true, message: "Test notification sent" },
      });
    });

    await snp.gotoNotifications();
    await snp.waitForVisible(page.getByText("Discord").first());

    // Click the Test button in the Discord row
    await page
      .getByRole("button", { name: /^test$/i })
      .first()
      .click();

    // Success message appears
    await expect(page.getByText("Test notification sent")).toBeVisible({
      timeout: 10000,
    });

    expect(testCalled).toBe(1);
  });

  test("TC-07: Disable/Enable toggle on notifier calls PUT", async ({
    page,
  }) => {
    const snp = new SettingsNotificationsPage(page);
    await setupNotificationsMocks(page);
    await mockLoggedIn(page);

    let putBody: Record<string, unknown> = {};
    await page.route("**/api/notifiers/notifier-1", async (route) => {
      if (route.request().method() === "PUT") {
        try {
          putBody = (await route.request().postDataJSON()) as Record<
            string,
            unknown
          >;
        } catch {
          // ignore
        }
        await route.fulfill({
          json: {
            notifier: { ...MOCK_NOTIFIER, enabled: false },
          },
        });
        // After PUT, subsequent GET returns the disabled notifier
        await page.route("**/api/notifiers**", (r) =>
          r.fulfill({
            json: {
              notifiers: [{ ...MOCK_NOTIFIER, enabled: false }],
            },
          }),
        );
      } else {
        await route.fulfill({ json: { notifier: MOCK_NOTIFIER } });
      }
    });

    await snp.gotoNotifications();
    await snp.waitForVisible(page.getByText("Discord").first());

    // Click the Disable button
    await page
      .getByRole("button", { name: /^disable$/i })
      .first()
      .click();

    // Wait for the status pill to change
    await expect(page.getByText("Disabled").first()).toBeVisible({
      timeout: 10000,
    });

    // PUT was called with enabled: false
    expect(putBody).toMatchObject({ enabled: false });
  });

  test("TC-08: Delete notifier calls DELETE and removes row", async ({
    page,
  }) => {
    const snp = new SettingsNotificationsPage(page);
    await setupNotificationsMocks(page);
    await mockLoggedIn(page);

    let deleteCalled = 0;
    await page.route("**/api/notifiers/notifier-1", async (route) => {
      if (route.request().method() === "DELETE") {
        deleteCalled++;
        await route.fulfill({ json: {} });
        // After DELETE, subsequent GET returns empty list
        await page.route("**/api/notifiers**", (r) =>
          r.fulfill({ json: { notifiers: [] } }),
        );
      } else {
        await route.fulfill({ json: { notifier: MOCK_NOTIFIER } });
      }
    });

    await snp.gotoNotifications();
    await snp.waitForVisible(page.getByText("Discord").first());

    // Click the Delete button
    await page
      .getByRole("button", { name: /^delete$/i })
      .first()
      .click();

    // Wait for success message and empty state
    await expect(page.getByText("Notifier deleted")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("No notifiers configured.")).toBeVisible({
      timeout: 10000,
    });

    expect(deleteCalled).toBe(1);
  });

  test("TC-09: Streaming departure alerts toggle fires PUT", async ({
    page,
  }) => {
    const snp = new SettingsNotificationsPage(page);
    await setupNotificationsMocks(page, []);
    await mockLoggedIn(page);

    let putBody: Record<string, unknown> = {};
    await page.route(
      "**/api/user/settings/departure-alerts**",
      async (route) => {
        if (route.request().method() === "PUT") {
          try {
            putBody = (await route.request().postDataJSON()) as Record<
              string,
              unknown
            >;
          } catch {
            // ignore
          }
          await route.fulfill({
            json: {
              streamingDeparturesEnabled: true,
              departureAlertLeadDays: 7,
            },
          });
        } else {
          await route.fulfill({ json: MOCK_DEPARTURE_ALERTS });
        }
      },
    );

    await snp.gotoNotifications();
    await snp.waitForVisible(snp.notifiersSection());

    // Find the "Enable departure alerts" switch and click it
    await page
      .getByRole("switch", { name: /enable departure alerts/i })
      .click();

    // Success message
    await expect(page.getByText("Settings saved")).toBeVisible({
      timeout: 10000,
    });

    // PUT called with correct payload
    expect(putBody).toMatchObject({ streamingDeparturesEnabled: true });

    // Lead time selector appears now that it's enabled
    await expect(page.getByLabel(/alert lead time/i)).toBeVisible();
  });

  test("TC-10: Streaming alerts trigger toggle included in POST payload", async ({
    page,
  }) => {
    const snp = new SettingsNotificationsPage(page);
    await setupNotificationsMocks(page, []);
    await mockLoggedIn(page);

    let postBody: Record<string, unknown> = {};
    await page.route("**/api/notifiers", async (route) => {
      if (route.request().method() === "POST") {
        try {
          postBody = (await route.request().postDataJSON()) as Record<
            string,
            unknown
          >;
        } catch {
          // ignore
        }
        await route.fulfill({
          json: {
            notifier: {
              ...MOCK_NOTIFIER,
              id: "notifier-new",
              streaming_alerts_enabled: false,
              friend_activity_alerts_enabled: true,
            },
          },
        });
      } else {
        await route.fulfill({ json: { notifiers: [] } });
      }
    });

    await snp.gotoNotifications();
    await snp.waitForVisible(snp.addNotifierButton());
    await snp.addNotifierButton().click();

    // Fill webhook URL
    await page
      .getByLabel(/webhook url/i)
      .fill("https://discord.com/api/webhooks/999/xyz");

    // Toggle "Streaming availability alerts" off (it defaults to on)
    await page
      .getByRole("switch", { name: /streaming availability alerts/i })
      .click();

    // Toggle "Friend activity alerts" on (it defaults to off)
    await page.getByRole("switch", { name: /friend activity alerts/i }).click();

    // Submit
    await page.getByRole("button", { name: /create notifier/i }).click();

    // Wait for success
    await expect(page.getByText("Notifier created")).toBeVisible({
      timeout: 10000,
    });

    // POST body has correct trigger flags
    expect(postBody).toMatchObject({
      streaming_alerts_enabled: false,
      friend_activity_alerts_enabled: true,
    });
  });
});
