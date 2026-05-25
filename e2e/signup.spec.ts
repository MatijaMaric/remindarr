import { test, expect } from "@playwright/test";
import { mockLoggedIn } from "./helpers";
import { SignupPage } from "./pages/signup-page";

/**
 * Stub the home-page API calls so the page's "load" event fires quickly after
 * a real signup redirects the browser to "/". Without these stubs the titles
 * and episodes endpoints return slow/empty responses, causing waitForURL to
 * exceed its timeout before the load event is emitted.
 */
async function stubHomepageApis(page: import("@playwright/test").Page) {
  await page.route("**/api/titles**", (route) =>
    route.fulfill({ json: { titles: [], count: 0 } }),
  );
  await page.route("**/api/titles/providers", (route) =>
    route.fulfill({ json: { providers: [] } }),
  );
  await page.route("**/api/titles/genres", (route) =>
    route.fulfill({ json: { genres: [] } }),
  );
  await page.route("**/api/titles/languages", (route) =>
    route.fulfill({ json: { languages: [] } }),
  );
  await page.route("**/api/episodes/upcoming", (route) =>
    route.fulfill({ json: { today: [], upcoming: [], unwatched: [] } }),
  );
  await page.route("**/api/browse**", (route) =>
    route.fulfill({
      json: {
        titles: [],
        page: 1,
        totalPages: 1,
        totalResults: 0,
        availableGenres: [],
        availableProviders: [],
        availableLanguages: [],
      },
    }),
  );
}

// Run signup tests serially: TC-01 and TC-02 hit the real auth backend, and
// the dev server's default rate limit (20/min) is easily exceeded by 11
// parallel workers all making auth requests concurrently.
test.describe.configure({ mode: "serial" });

test.describe("Signup", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "UI flow; running once under chromium is sufficient",
  );

  // ── TC-01: Happy path — all fields ────────────────────────────────────────
  test("TC-01: signs up with all fields and redirects to home", async ({
    page,
  }) => {
    const signup = new SignupPage(page);
    const suffix = Date.now();
    const username = `tc01_${suffix}`;

    // Mock get-session to always return null (not logged in) so the signup
    // form stays visible. The navigate('/') in handleSubmit fires directly
    // after the signup call resolves — it doesn't wait for a session update.
    await page.route("**/api/auth/get-session", (route) =>
      route.fulfill({ json: null }),
    );

    // Stub home-page API calls so "load" fires promptly after the redirect.
    await stubHomepageApis(page);

    // Capture what the UI sends to the signup endpoint and return a mock
    // success so the navigate('/') fires.
    let capturedBody: Record<string, unknown> | undefined;
    await page.route("**/api/auth/sign-up/email", async (route) => {
      capturedBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          token: "mock-token",
          user: {
            id: "mock-id",
            username,
            email: `${username}@example.com`,
            name: "Test User One",
            role: "user",
          },
        }),
      });
    });

    await signup.gotoSignup();
    await signup.fillForm({
      username,
      email: `${username}@example.com`,
      displayName: "Test User One",
      password: "securePass1",
    });
    await signup.submit();

    // The form navigates to "/" immediately after a successful mock signup.
    await page.waitForURL((url) => url.pathname === "/", {
      timeout: 15_000,
      waitUntil: "domcontentloaded",
    });

    // Verify the UI submitted all fields correctly.
    expect(capturedBody?.username).toBe(username);
    expect(capturedBody?.email).toBe(`${username}@example.com`);
    expect(capturedBody?.name).toBe("Test User One");
  });

  // ── TC-02: Happy path — display name omitted (defaults to username) ───────
  test("TC-02: display name omitted defaults to username on server", async ({
    page,
  }) => {
    const signup = new SignupPage(page);
    const suffix = Date.now() + 2;
    const username = `tc02_${suffix}`;

    await page.route("**/api/auth/get-session", (route) =>
      route.fulfill({ json: null }),
    );

    // Stub home-page API calls so "load" fires promptly after the redirect.
    await stubHomepageApis(page);

    // Capture the request body — when displayName is blank, SignupPage sends
    // `name = username` as the fallback (see: `name || username` in handleSubmit).
    let capturedBody: Record<string, unknown> | undefined;
    await page.route("**/api/auth/sign-up/email", async (route) => {
      capturedBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          token: "mock-token",
          user: {
            id: "mock-id-2",
            username,
            email: `${username}@example.com`,
            name: username,
            role: "user",
          },
        }),
      });
    });

    await signup.gotoSignup();
    await signup.fillForm({
      username,
      email: `${username}@example.com`,
      password: "securePass2",
      // displayName intentionally omitted
    });
    await signup.submit();

    await page.waitForURL((url) => url.pathname === "/", {
      timeout: 15_000,
      waitUntil: "domcontentloaded",
    });

    // When display name is blank the UI sends name = username as the fallback
    // (see: `name || username` in SignupPage.handleSubmit).
    expect(capturedBody?.name).toBe(username);
  });

  // ── TC-03: Loading state ──────────────────────────────────────────────────
  test("TC-03: button shows loading state while request is in-flight", async ({
    page,
  }) => {
    const signup = new SignupPage(page);

    // Fresh browser context has no session cookie — get-session goes to the
    // real backend and returns null, so SignupPage renders without redirecting.
    //
    // Intercept ONLY the signup endpoint and delay it by 1.5 s. All other
    // requests (get-session, providers, etc.) pass through to the real backend
    // so the page can reach "load" state normally.
    await page.route("**/api/auth/sign-up/email", async (route) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 1_500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: "mock-id",
            username: "loadingtest",
            email: "loadingtest@example.com",
            name: "loadingtest",
          },
          token: "mock-token",
        }),
      });
    });

    await signup.gotoSignup();
    await signup.fillForm({
      username: "loadingtest",
      email: "loadingtest@example.com",
      password: "securePass3",
    });

    await signup.submit();

    // During the 1.5 s artificial delay the button should show loading state
    await expect(signup.loadingButton).toBeVisible({ timeout: 2_000 });
    await expect(signup.loadingButton).toBeDisabled();
  });

  // ── TC-04: Duplicate username ─────────────────────────────────────────────
  test("TC-04: shows error banner for duplicate username", async ({ page }) => {
    const signup = new SignupPage(page);

    await page.route("**/api/auth/sign-up/email", (route) =>
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Username is already taken. Please try another.",
        }),
      }),
    );

    await signup.gotoSignup();
    await signup.fillForm({
      username: "existinguser",
      email: "new@example.com",
      password: "securePass4",
    });
    await signup.submit();

    await expect(signup.errorBanner).toBeVisible({ timeout: 5_000 });
    await expect(signup.errorBanner).toContainText(
      "Username is already taken. Please try another.",
    );
    await expect(page).toHaveURL(/\/signup/);

    // Form fields should retain values
    await expect(signup.usernameField).toHaveValue("existinguser");
    await expect(signup.emailField).toHaveValue("new@example.com");
  });

  // ── TC-05: Duplicate email ────────────────────────────────────────────────
  test("TC-05: shows error banner for duplicate email", async ({ page }) => {
    const signup = new SignupPage(page);

    await page.route("**/api/auth/sign-up/email", (route) =>
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          message: "User already exists. Use another email.",
        }),
      }),
    );

    await signup.gotoSignup();
    await signup.fillForm({
      username: "brandnewuser",
      email: "existing@example.com",
      password: "securePass5",
    });
    await signup.submit();

    await expect(signup.errorBanner).toBeVisible({ timeout: 5_000 });
    await expect(signup.errorBanner).toContainText(
      "User already exists. Use another email.",
    );
    await expect(page).toHaveURL(/\/signup/);
  });

  // ── TC-06: Password too short ─────────────────────────────────────────────
  test("TC-06: shows error banner when password is too short", async ({
    page,
  }) => {
    const signup = new SignupPage(page);

    await page.route("**/api/auth/sign-up/email", (route) =>
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Password must be at least 8 characters.",
        }),
      }),
    );

    await signup.gotoSignup();
    await signup.fillForm({
      username: "shortpwuser",
      email: "shortpw@example.com",
      password: "abc1234", // 7 characters — no HTML5 minlength, reaches server
    });
    await signup.submit();

    await expect(signup.errorBanner).toBeVisible({ timeout: 5_000 });
    await expect(signup.errorBanner).toContainText("8");
    await expect(page).toHaveURL(/\/signup/);
  });

  // ── TC-07: Invalid username characters ────────────────────────────────────
  test("TC-07: shows error banner for invalid username characters", async ({
    page,
  }) => {
    const signup = new SignupPage(page);

    await page.route("**/api/auth/sign-up/email", (route) =>
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ message: "Username is invalid" }),
      }),
    );

    await signup.gotoSignup();
    await signup.fillForm({
      username: "bad-username", // dash is rejected server-side
      email: "invalid@example.com",
      password: "securePass7",
    });
    await signup.submit();

    await expect(signup.errorBanner).toBeVisible({ timeout: 5_000 });
    await expect(signup.errorBanner).toContainText("Username is invalid");
    await expect(page).toHaveURL(/\/signup/);
  });

  // ── TC-08: Empty form — HTML5 validation prevents submission ──────────────
  test("TC-08: empty form submit is blocked by HTML5 validation", async ({
    page,
  }) => {
    const signup = new SignupPage(page);

    let requestMade = false;
    await page.route("**/api/auth/sign-up/email", () => {
      requestMade = true;
    });

    await signup.gotoSignup();
    // Click submit without filling any fields
    await signup.submitButton.click();

    // HTML5 validation fires synchronously — give a short grace period
    await page.waitForTimeout(300);

    expect(requestMade).toBe(false);
    await expect(page).toHaveURL(/\/signup/);

    // Focus should be on the first required field (Username)
    await expect(signup.usernameField).toBeFocused();
  });

  // ── TC-09: Already logged in — /signup redirects to / ─────────────────────
  test("TC-09: authenticated user visiting /signup is redirected to /", async ({
    page,
  }) => {
    await mockLoggedIn(page);

    // Also stub downstream API calls that the home page will fire so the
    // redirect completes cleanly
    await page.route("**/api/titles**", (route) =>
      route.fulfill({ json: { titles: [], count: 0 } }),
    );
    await page.route("**/api/titles/providers", (route) =>
      route.fulfill({ json: { providers: [] } }),
    );
    await page.route("**/api/titles/genres", (route) =>
      route.fulfill({ json: { genres: [] } }),
    );
    await page.route("**/api/titles/languages", (route) =>
      route.fulfill({ json: { languages: [] } }),
    );

    await page.goto("/signup");

    await page.waitForURL((url) => url.pathname === "/", { timeout: 10_000 });
    await expect(page).toHaveURL("/");
  });

  // ── TC-10: Navigation cross-links ─────────────────────────────────────────
  test("TC-10a: signup page has a working Sign in link to /login", async ({
    page,
  }) => {
    const signup = new SignupPage(page);
    await signup.gotoSignup();

    await signup.signInLink.click();
    await page.waitForURL((url) => url.pathname === "/login", {
      timeout: 10_000,
    });
    await expect(page).toHaveURL(/\/login/);
    // Login form should be visible
    await expect(page.getByLabel("Username")).toBeVisible();
  });

  test("TC-10b: login page has a working Sign up link to /signup", async ({
    page,
  }) => {
    await page.goto("/login");

    const signUpLink = page.getByRole("link", { name: /sign up/i });
    await signUpLink.click();
    await page.waitForURL((url) => url.pathname === "/signup", {
      timeout: 10_000,
    });
    await expect(page).toHaveURL(/\/signup/);

    // All four fields should be visible
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Display Name")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  });
});
