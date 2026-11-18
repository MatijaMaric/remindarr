import { test, expect } from "@playwright/test";
import { mockLoggedOut, mockLoggedIn } from "./helpers";
import { InvitePage } from "./pages/invite-page";

test.describe.configure({ mode: "serial" });

// Relative dates so the fixtures never rot — getStatus() in InvitePage compares
// expires_at against `now`, so a hardcoded date eventually flips Pending → Expired.
const FUTURE = new Date(Date.now() + 7 * 86400000).toISOString(); // +7 days

const MOCK_INVITATION_PENDING = {
  id: "inv-001",
  code: "ABCD1234",
  created_at: "2026-05-20T10:00:00Z",
  expires_at: FUTURE,
  used_at: null,
  used_by: null,
};

const MOCK_INVITATION_USED = {
  id: "inv-002",
  code: "EFGH5678",
  created_at: "2026-05-01T08:00:00Z",
  expires_at: "2026-06-01T08:00:00Z",
  used_at: "2026-05-10T14:00:00Z",
  used_by: {
    id: "user-2",
    username: "alice",
    display_name: "Alice",
    image: null,
  },
};

async function setupInviteMocks(
  page: InvitePage["page"],
  invitations: object[] = [],
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
  // Invitations endpoint
  await page.route("**/api/invitations**", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { invitations } });
    }
    return route.fulfill({ json: {} });
  });
}

test.describe("Invite / Accept flow", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Running on chromium only",
  );

  test("TC-01: Page loads with heading, generate button, and empty invitation list", async ({
    page,
  }) => {
    const ip = new InvitePage(page);
    await setupInviteMocks(page);
    await mockLoggedIn(page);
    await ip.gotoInvite();
    await ip.waitForVisible(ip.heading());

    await expect(ip.heading()).toBeVisible();
    await expect(ip.createButton()).toBeVisible();
    await expect(ip.createButton()).toBeEnabled();
    await expect(ip.emptyState()).toBeVisible();

    expect(page.url()).toContain("/invite");
  });

  test("TC-02: Generating an invitation link adds it to the list", async ({
    page,
  }) => {
    const ip = new InvitePage(page);
    await setupInviteMocks(page);
    await mockLoggedIn(page);

    let postCalled = 0;
    // Stateful: after POST, GET returns the new invitation
    let invitations: object[] = [];
    await page.route("**/api/invitations**", async (route) => {
      if (route.request().method() === "POST") {
        postCalled++;
        invitations = [MOCK_INVITATION_PENDING];
        await route.fulfill({
          status: 201,
          json: {
            id: "inv-001",
            code: "ABCD1234",
            expires_at: FUTURE,
          },
        });
      } else {
        await route.fulfill({ json: { invitations } });
      }
    });

    await ip.captureShares();
    await ip.gotoInvite();
    await ip.waitForVisible(ip.createButton());

    await ip.createButton().click();

    // Wait for the invitation card: status badge shows "Pending"
    await expect(page.getByText("Pending")).toBeVisible({ timeout: 10000 });

    expect(postCalled).toBe(1);

    // The card does not print the raw code (#1428) …
    await expect(page.getByText("ABCD1234")).toHaveCount(0);
    // … Share hands out the full invite link carrying it instead.
    await ip.shareButton().click();
    await expect
      .poll(() => ip.sharedUrls())
      .toEqual([expect.stringMatching(/\/invite\?code=ABCD1234$/)]);

    // Revoke button visible (pending-only)
    await expect(page.getByRole("button", { name: /revoke/i })).toBeVisible();

    // Empty-state gone
    await expect(ip.emptyState()).not.toBeVisible();
  });

  test("TC-03: Auto-redeeming a valid invite code shows a success banner", async ({
    page,
  }) => {
    const ip = new InvitePage(page);
    await setupInviteMocks(page);
    await mockLoggedIn(page);

    await page.route("**/api/invitations/redeem/VALIDCODE**", (route) =>
      route.fulfill({
        json: {
          success: true,
          inviter: { id: "user-99", username: "bob", display_name: "Bob" },
        },
      }),
    );

    await ip.gotoInviteWithCode("VALIDCODE");
    await ip.waitForVisible(ip.heading());

    // Wait for success banner containing Bob's name
    await expect(page.getByText(/bob/i, { exact: false }).first()).toBeVisible({
      timeout: 10000,
    });

    // Success banner rendered in the page (not just the toast)
    await expect(ip.redeemBanner()).toHaveText(
      "You and @Bob are now following each other!",
    );

    // No error banner
    await expect(
      ip.errorBanner(/expired|invalid|not found|failed/i),
    ).toHaveCount(0);

    // Code removed from URL
    await page.waitForURL("**/invite", { waitUntil: "commit" });
    expect(page.url()).not.toContain("code=");
  });

  test("TC-04: Auto-redeeming an expired/invalid code shows an error banner", async ({
    page,
  }) => {
    const ip = new InvitePage(page);
    await setupInviteMocks(page);
    await mockLoggedIn(page);

    await page.route("**/api/invitations/redeem/BADCODE**", (route) =>
      route.fulfill({
        status: 410,
        json: { error: "Invitation has expired" },
      }),
    );

    await ip.gotoInviteWithCode("BADCODE");
    await ip.waitForVisible(ip.heading());

    // Wait for error banner
    await expect(page.getByText("Invitation has expired").first()).toBeVisible({
      timeout: 10000,
    });

    await expect(ip.errorBanner("Invitation has expired")).toBeVisible();

    // No success banner
    await expect(ip.redeemBanner()).toHaveCount(0);

    // Code removed from URL
    await page.waitForURL("**/invite", { waitUntil: "commit" });
    expect(page.url()).not.toContain("code=");
  });

  test("TC-05: Revoking a pending invitation removes it", async ({ page }) => {
    const ip = new InvitePage(page);
    await setupInviteMocks(page, [MOCK_INVITATION_PENDING]);
    await mockLoggedIn(page);

    let deleteCalled = 0;
    let currentInvitations: object[] = [MOCK_INVITATION_PENDING];

    // Single stateful handler covers both GET /invitations and DELETE /invitations/:id
    // Registered after setupInviteMocks so it has higher priority (LIFO).
    await page.route("**/api/invitations**", async (route) => {
      const method = route.request().method();
      const url = route.request().url();
      if (method === "DELETE" && url.includes("/inv-001")) {
        deleteCalled++;
        currentInvitations = [];
        await route.fulfill({ json: {} });
      } else if (method === "GET" && !url.includes("/inv-")) {
        await route.fulfill({
          json: { invitations: currentInvitations },
        });
      } else {
        await route.fulfill({ json: {} });
      }
    });

    await ip.gotoInvite();
    // The card does not print the code (#1428); its Pending badge marks it.
    await ip.waitForVisible(page.getByText("Pending"));

    await page.getByRole("button", { name: /revoke/i }).click();

    // Wait for empty state after list refetch
    await expect(ip.emptyState()).toBeVisible({ timeout: 10000 });

    expect(deleteCalled).toBe(1);

    // Invitation card is gone
    await expect(page.getByText("Pending")).toHaveCount(0);
    await expect(ip.shareButton()).toHaveCount(0);
  });

  test("TC-06: Unauthenticated user is redirected to /login", async ({
    page,
  }) => {
    const ip = new InvitePage(page);
    await mockLoggedOut(page);
    await ip.gotoInvite();
    await page.waitForURL("**/login**", { waitUntil: "commit" });

    expect(page.url()).toContain("/login");
    await expect(ip.heading()).not.toBeVisible();
    await expect(ip.createButton()).not.toBeVisible();
  });

  test("TC-07: Used invitation card shows who redeemed it and links to their profile", async ({
    page,
  }) => {
    const ip = new InvitePage(page);
    await setupInviteMocks(page, [MOCK_INVITATION_USED]);
    await mockLoggedIn(page);

    await ip.gotoInvite();
    await ip.waitForVisible(ip.heading());

    // Wait for invitation card: status badge shows "Used by @alice".
    // The code itself is not printed on the card (#1428).
    await expect(
      page.getByText(/used by/i, { exact: false }).first(),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("EFGH5678")).toHaveCount(0);

    // Link to @alice's profile
    const aliceLink = page.getByRole("link", { name: "@alice" });
    await expect(aliceLink).toBeVisible();
    await expect(aliceLink).toHaveAttribute("href", "/user/alice");

    // No Revoke or Share buttons (used-only hides pending actions)
    await expect(
      page.getByRole("button", { name: /revoke/i }),
    ).not.toBeVisible();
    await expect(ip.shareButton()).toHaveCount(0);
  });
});
