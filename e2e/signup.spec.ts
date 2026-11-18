import { test, expect } from "@playwright/test";
import {
  isAuthGetSession,
  mockLoggedIn,
  MOCK_SESSION,
  stubAuthenticatedShell,
} from "./helpers";
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

/**
 * Stateful get-session mock mirroring the real backend: signed out until the
 * sign-up call succeeds, signed in afterwards. Since #1429 SignupPage only
 * redirects from an effect once AuthContext has a `user`, which it reads from
 * get-session after sign-up (AuthContext.changeSession -> refreshSession).
 *
 * The first signed-in get-session response is parked until `release()` so the
 * test can prove the page does not leave /signup before the session is signed
 * in. `held` resolves once that request has arrived.
 */
async function mockSessionAfterSignup(
  page: import("@playwright/test").Page,
  user: { id: string; username: string; email: string; name: string },
) {
  let signedIn = false;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let markHeld!: () => void;
  const held = new Promise<void>((r) => (markHeld = r));
  await stubAuthenticatedShell(page);
  await page.route(isAuthGetSession, async (route) => {
    if (signedIn) {
      markHeld();
      await gate;
    }
    await route.fulfill({
      json: signedIn
        ? {
            session: { ...MOCK_SESSION.session, userId: user.id },
            user: { ...MOCK_SESSION.user, ...user, display_name: user.name },
          }
        : null,
    });
  });
  return {
    markSignedIn: () => {
      signedIn = true;
    },
    held,
    release: () => release(),
  };
}

/**
 * Sign-up redirect contract: stay on /signup while the session is still being
 * resolved, then land on "/" signed in as the new user (nav profile link).
 */
async function expectSignedInRedirect(
  page: import("@playwright/test").Page,
  session: Awaited<ReturnType<typeof mockSessionAfterSignup>>,
  user: { username: string; name: string },
) {
  await session.held;
  await expect(page).toHaveURL(/\/signup/);
  session.release();
  await page.waitForURL((url) => url.pathname === "/", {
    timeout: 15_000,
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("navigation").getByRole("link", { name: user.name }),
  ).toHaveAttribute("href", `/user/${user.username}`);
}

// Run signup tests serially: several tests (e.g. TC-03) let get-session and
// other auth calls through to the real backend, and
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

    // Signed out until sign-up succeeds, then signed in — the redirect to "/"
    // is driven by the session becoming signed in, not by handleSubmit.
    const session = await mockSessionAfterSignup(page, {
      id: "mock-id",
      username,
      email: `${username}@example.com`,
      name: "Test User One",
    });

    // Stub home-page API calls so "load" fires promptly after the redirect.
    await stubHomepageApis(page);

    // Capture what the UI sends to the signup endpoint and return a mock
    // success; from then on get-session reports the new user.
    let capturedBody: Record<string, unknown> | undefined;
    await page.route("**/api/auth/sign-up/email", async (route) => {
      capturedBody = route.request().postDataJSON() as Record<string, unknown>;
      session.markSignedIn();
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

    // Once the session is signed in, the page redirects to "/".
    await expectSignedInRedirect(page, session, {
      username,
      name: "Test User One",
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

    const session = await mockSessionAfterSignup(page, {
      id: "mock-id-2",
      username,
      email: `${username}@example.com`,
      name: username,
    });

    // Stub home-page API calls so "load" fires promptly after the redirect.
    await stubHomepageApis(page);

    // Capture the request body — when displayName is blank, SignupPage sends
    // `name = username` as the fallback (see: `name || username` in handleSubmit).
    let capturedBody: Record<string, unknown> | undefined;
    await page.route("**/api/auth/sign-up/email", async (route) => {
      capturedBody = route.request().postDataJSON() as Record<string, unknown>;
      session.markSignedIn();
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

    await expectSignedInRedirect(page, session, { username, name: username });

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

    await expect(
      signup.errorBanner("Username is already taken. Please try another."),
    ).toBeVisible({ timeout: 5_000 });
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

    await expect(
      signup.errorBanner("User already exists. Use another email."),
    ).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/signup/);
  });

  // ── TC-06: Password too short ─────────────────────────────────────────────
  test("TC-06: too-short password is blocked before reaching the server", async ({
    page,
  }) => {
    const signup = new SignupPage(page);

    // Since #1429 the password field has minLength=8, so a 7-character
    // password is rejected by the browser and no sign-up request is sent.
    let requestMade = false;
    await page.route("**/api/auth/sign-up/email", (route) => {
      requestMade = true;
      return route.fulfill({
        status: 422,
        json: { message: "Password must be at least 8 characters." },
      });
    });

    await signup.gotoSignup();
    await signup.fillForm({
      username: "shortpwuser",
      email: "shortpw@example.com",
      password: "abc1234", // 7 characters
    });
    await signup.submit();

    await expect(signup.passwordField).toHaveJSProperty(
      "validity.tooShort",
      true,
    );
    await expect(signup.passwordField).toBeFocused();
    expect(requestMade).toBe(false);
    await expect(page).toHaveURL(/\/signup/);
  });

  // ── TC-07: Invalid username characters ────────────────────────────────────
  test("TC-07: invalid username characters are blocked by the browser", async ({
    page,
  }) => {
    const signup = new SignupPage(page);

    // Since #1429 the username field has pattern="[a-zA-Z0-9_.\-]+" (the
    // server accepts the same set, dashes included), so "!" never reaches it.
    let requestMade = false;
    await page.route("**/api/auth/sign-up/email", (route) => {
      requestMade = true;
      return route.fulfill({
        status: 422,
        json: { message: "Username is invalid" },
      });
    });

    await signup.gotoSignup();
    await signup.fillForm({
      username: "bad!username",
      email: "invalid@example.com",
      password: "securePass7",
    });
    await signup.submit();

    await expect(signup.usernameField).toHaveJSProperty(
      "validity.patternMismatch",
      true,
    );
    await expect(signup.usernameField).toBeFocused();
    expect(requestMade).toBe(false);
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
