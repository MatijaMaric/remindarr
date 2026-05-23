import { test, expect } from "@playwright/test";
import { mockLoggedIn, mockLoggedOut } from "./helpers";
import { AdminUsersPage } from "./pages/admin-users-page";

test.describe.configure({ mode: "serial" });

// Admin session — MOCK_SESSION does NOT have admin role; construct inline.
const MOCK_ADMIN_SESSION = {
  session: {
    id: "session-1",
    userId: "user-1",
    expiresAt: "2099-01-01T00:00:00Z",
    token: "mock-session-token",
  },
  user: {
    id: "user-1",
    name: "Admin User",
    email: "admin@example.com",
    username: "admin",
    role: "admin",
    is_admin: true,
  },
};

const ADMIN_USER = {
  id: "user-1",
  username: "admin",
  name: "Admin User",
  email: "admin@example.com",
  role: "admin",
  is_admin: 1,
  auth_provider: "credential",
  banned: false,
  ban_reason: null,
  ban_expires: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const REGULAR_USER = {
  id: "user-2",
  username: "regularuser",
  name: "Regular User",
  email: "regular@example.com",
  role: "user",
  is_admin: 0,
  auth_provider: "credential",
  banned: false,
  ban_reason: null,
  ban_expires: null,
  created_at: "2024-02-01T00:00:00Z",
  updated_at: "2024-02-01T00:00:00Z",
};

const TWO_USER_LIST = {
  users: [ADMIN_USER, REGULAR_USER],
  total: 2,
  page: 1,
  page_size: 25,
  total_pages: 1,
};

async function mockAdminSession(page: AdminUsersPage["page"]) {
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ json: MOCK_ADMIN_SESSION }),
  );
  await page.route("**/api/auth/custom/providers", (route) =>
    route.fulfill({ json: { local: true, oidc: null } }),
  );
}

async function mockBackgroundApis(page: AdminUsersPage["page"]) {
  await page.route("**/api/achievements/me**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/recommendations/count**", (route) =>
    route.fulfill({ json: { count: 0 } }),
  );
  await page.route("**/api/user/settings/subscriptions**", (route) =>
    route.fulfill({ json: { providerIds: [], onlyMine: false } }),
  );
}

test.describe("Admin users page", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Running on chromium only",
  );

  test("TC-01: Admin users page loads and shows user list", async ({
    page,
  }) => {
    const aup = new AdminUsersPage(page);
    await mockAdminSession(page);
    await mockBackgroundApis(page);
    await page.route("**/api/admin/users**", (route) =>
      route.fulfill({ json: TWO_USER_LIST }),
    );

    await aup.gotoAdminUsers();
    await aup.waitForVisible(aup.heading());

    // Heading "User Management"
    await expect(aup.heading()).toContainText("User Management");

    // Both usernames visible
    await expect(page.getByText("admin").first()).toBeVisible();
    await expect(page.getByText("regularuser").first()).toBeVisible();

    // Back to settings link
    await expect(aup.backToSettingsLink()).toBeVisible();

    // Total count
    await expect(page.getByText("2 users")).toBeVisible();
  });

  test("TC-02: Non-admin user sees access-denied message", async ({ page }) => {
    const aup = new AdminUsersPage(page);
    await mockLoggedIn(page);
    await mockBackgroundApis(page);
    // Mock admin/users so the query doesn't 401 → redirect to login
    await page.route("**/api/admin/users**", (route) =>
      route.fulfill({
        json: { users: [], total: 0, page: 1, page_size: 25, total_pages: 0 },
      }),
    );

    await aup.gotoAdminUsers();
    await page.waitForURL("**/admin/users**", { waitUntil: "commit" });

    await expect(page.getByText(/access denied/i)).toBeVisible();
    await expect(page.getByRole("table")).not.toBeVisible();
  });

  test("TC-03: Unauthenticated user is redirected to /login", async ({
    page,
  }) => {
    const aup = new AdminUsersPage(page);
    await mockLoggedOut(page);

    await aup.gotoAdminUsers();
    await page.waitForURL("**/login**", { waitUntil: "commit" });

    expect(page.url()).toContain("/login");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("TC-04: Role badges shown for admin and regular users", async ({
    page,
  }) => {
    const aup = new AdminUsersPage(page);
    await mockAdminSession(page);
    await mockBackgroundApis(page);
    await page.route("**/api/admin/users**", (route) =>
      route.fulfill({ json: TWO_USER_LIST }),
    );

    await aup.gotoAdminUsers();
    await aup.waitForVisible(aup.heading());

    // "Admin" badge in admin's row (last = sm:table-cell td, visible on desktop)
    await expect(aup.userRow("admin").getByText("Admin").last()).toBeVisible();
    // "User" badge in regularuser's row (last = sm:table-cell td, visible on desktop)
    await expect(
      aup.userRow("regularuser").getByText("User").last(),
    ).toBeVisible();

    // Admin row (currently signed-in user) shows "you" label, not action buttons
    await expect(aup.userRow("admin").getByText("you")).toBeVisible();

    // Regularuser row has action buttons
    await expect(aup.promoteButton("regularuser")).toBeVisible();
    await expect(aup.deleteButton("regularuser")).toBeVisible();
  });

  test("TC-05: Promoting a regular user to admin updates their role badge", async ({
    page,
  }) => {
    const aup = new AdminUsersPage(page);
    await mockAdminSession(page);
    await mockBackgroundApis(page);

    // Stateful handler: after PUT /role, GET returns promoted user
    let regularUserRole = "user";
    let regularUserIsAdmin = 0;

    await page.route("**/api/admin/users**", (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (method === "PUT" && url.includes("/user-2/role")) {
        regularUserRole = "admin";
        regularUserIsAdmin = 1;
        return route.fulfill({ json: { message: "Role updated" } });
      }

      return route.fulfill({
        json: {
          users: [
            ADMIN_USER,
            {
              ...REGULAR_USER,
              role: regularUserRole,
              is_admin: regularUserIsAdmin,
            },
          ],
          total: 2,
          page: 1,
          page_size: 25,
          total_pages: 1,
        },
      });
    });

    await aup.gotoAdminUsers();
    await aup.waitForVisible(page.getByText("regularuser").first());

    // Click promote button
    await aup.promoteButton("regularuser").click();

    // After refetch, "Admin" badge appears in regularuser's row (last = sm:table-cell, visible)
    await expect(
      aup.userRow("regularuser").getByText("Admin").last(),
    ).toBeVisible();
    // Demote button is now shown
    await expect(aup.demoteButton("regularuser")).toBeVisible();
  });

  test("TC-06: Deleting a user removes them from the table", async ({
    page,
  }) => {
    const aup = new AdminUsersPage(page);
    await mockAdminSession(page);
    await mockBackgroundApis(page);

    let deleted = false;

    await page.route("**/api/admin/users**", (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (method === "DELETE" && url.includes("/user-2")) {
        deleted = true;
        return route.fulfill({ json: { message: "User deleted" } });
      }

      return route.fulfill({
        json: deleted
          ? {
              users: [ADMIN_USER],
              total: 1,
              page: 1,
              page_size: 25,
              total_pages: 1,
            }
          : TWO_USER_LIST,
      });
    });

    await aup.gotoAdminUsers();
    await aup.waitForVisible(page.getByText("regularuser").first());

    // Click delete and confirm
    await aup.deleteButton("regularuser").click();
    await aup.waitForVisible(aup.confirmDeleteButton());
    await aup.confirmDeleteButton().click();

    // regularuser row is gone
    await expect(page.getByText("regularuser")).not.toBeVisible();
    await expect(page.getByText("1 users")).toBeVisible();
  });

  test("TC-07: Banning a user shows the ban dialog and updates the banned badge", async ({
    page,
  }) => {
    const aup = new AdminUsersPage(page);
    await mockAdminSession(page);
    await mockBackgroundApis(page);

    let banned = false;

    await page.route("**/api/admin/users**", (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (method === "PUT" && url.includes("/user-2/ban")) {
        banned = true;
        return route.fulfill({ json: { message: "User banned" } });
      }

      return route.fulfill({
        json: {
          users: [ADMIN_USER, { ...REGULAR_USER, banned: banned }],
          total: 2,
          page: 1,
          page_size: 25,
          total_pages: 1,
        },
      });
    });

    await aup.gotoAdminUsers();
    await aup.waitForVisible(page.getByText("regularuser").first());

    // Open ban dialog
    await aup.banButton("regularuser").click();

    // Dialog is visible
    await expect(page.getByText("Ban User").first()).toBeVisible();

    // Confirm ban
    await aup.confirmBanButton().click();

    // regularuser row now shows "Banned" badge
    await expect(aup.userRow("regularuser").getByText("Banned")).toBeVisible();
  });

  test("TC-08: Search filters the user list", async ({ page }) => {
    const aup = new AdminUsersPage(page);
    await mockAdminSession(page);
    await mockBackgroundApis(page);

    await page.route("**/api/admin/users**", (route) => {
      const url = route.request().url();
      if (url.includes("search=regular")) {
        return route.fulfill({
          json: {
            users: [REGULAR_USER],
            total: 1,
            page: 1,
            page_size: 25,
            total_pages: 1,
          },
        });
      }
      return route.fulfill({ json: TWO_USER_LIST });
    });

    await aup.gotoAdminUsers();
    await aup.waitForVisible(page.getByText("regularuser").first());

    // Type into search
    await aup.searchInput().fill("regular");

    // Only regularuser visible; admin username not visible in table body
    await expect(page.getByText("regularuser").first()).toBeVisible();
    // Wait for admin row to disappear from table
    await expect(
      page.getByRole("row", { name: /admin user/i }),
    ).not.toBeVisible();
  });
});
