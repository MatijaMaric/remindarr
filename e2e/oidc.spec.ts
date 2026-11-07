import { test, expect } from "@playwright/test";
import { MOCK_OIDC_URL, OIDC_PROVIDER_ID } from "./fixtures/constants";

test.describe("OIDC login flow", () => {
  // The mock IdP's deny-next switch is shared state.
  test.describe.configure({ mode: "serial" });
  // Conditional UI + virtual authenticators + social login all behave most
  // consistently on chromium. We only need the coverage once.
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "OIDC roundtrip runs once under chromium",
  );

  test("advertises OIDC provider on /api/auth/custom/providers", async ({
    request,
  }) => {
    const res = await request.get("/api/auth/custom/providers");
    expect(res.ok()).toBeTruthy();
    const json = (await res.json()) as {
      local: boolean;
      oidc: { name: string; providerId: string } | null;
    };
    expect(json.oidc).not.toBeNull();
    expect(json.oidc?.providerId).toBe("pocketid");
  });

  test("completes OIDC roundtrip and signs the user in", async ({ page }) => {
    await page.goto("/login");

    // The LoginPage renders an OIDC button when /api/auth/custom/providers
    // reports an `oidc` provider. The default providerId label is
    // "OpenID Connect" — match it specifically to avoid clashing with the
    // passkey / username-toggle buttons.
    const oidcButton = page.getByRole("button", {
      name: /sign in with openid connect/i,
    });
    await expect(oidcButton).toBeVisible({ timeout: 15_000 });

    // Clicking triggers better-auth's social sign-in, which 302s through the
    // mock authorize endpoint and lands back on the app with a session.
    await oidcButton.click();

    // Successful flows land on "/" (callback `callbackURL: "/"` in LoginPage).
    await expect(page).toHaveURL("/", { timeout: 30_000 });

    // Session should be set browser-side — hit get-session via the page
    // context so cookies from the OIDC redirect roundtrip are included.
    const session = await page.request.get("/api/auth/get-session");
    expect(session.ok()).toBeTruthy();
    const body = await session.json().catch(() => null);
    expect(
      body,
      "expected get-session to return a non-null session body",
    ).not.toBeNull();
    expect(body?.user?.id).toBeTruthy();
  });

  test("cancelling at the IdP returns to /login with an error and no session", async ({
    page,
    request,
  }) => {
    // Arm the mock IdP: the next /authorize answers error=access_denied.
    const armed = await request.post(`${MOCK_OIDC_URL}/__test/deny-next`);
    expect(armed.status()).toBe(204);

    await page.goto("/login");
    await page
      .getByRole("button", { name: /sign in with openid connect/i })
      .click();

    await expect(page).toHaveURL(/\/login\?.*error=access_denied/, {
      timeout: 30_000,
    });
    await expect(page.getByText(/access_denied/)).toBeVisible();
    const session = await page.request.get("/api/auth/get-session");
    expect(await session.json().catch(() => null)).toBeNull();
  });

  test("an expired or unknown callback state returns to /login with an error", async ({
    page,
  }) => {
    await page.goto(
      `/api/auth/oauth2/callback/${OIDC_PROVIDER_ID}?code=stale-code&state=expired-state`,
    );
    await expect(page).toHaveURL(/\/login\?.*error=/, { timeout: 30_000 });
    await expect(page.getByText(/login failed/i)).toBeVisible();
    const session = await page.request.get("/api/auth/get-session");
    expect(await session.json().catch(() => null)).toBeNull();
  });
});
