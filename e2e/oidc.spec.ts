import { test, expect } from "@playwright/test";

test.describe("OIDC login flow", () => {
  // Conditional UI + virtual authenticators + social login all behave most
  // consistently on chromium. We only need the coverage once.
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "OIDC roundtrip runs once under chromium"
  );

  test("advertises OIDC provider on /api/auth/custom/providers", async ({ request }) => {
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
    const oidcButton = page.getByRole("button", { name: /sign in with openid connect/i });
    await expect(oidcButton).toBeVisible({ timeout: 15_000 });

    // Clicking triggers better-auth's social sign-in, which 302s through the
    // mock authorize endpoint and lands back on the app with a session.
    await oidcButton.click();

    // Successful flows land on "/" (callback `callbackURL: "/"` in LoginPage).
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 30_000,
    });

    // Session should be set browser-side — hit get-session via the page
    // context so cookies from the OIDC redirect roundtrip are included.
    const session = await page.request.get("/api/auth/get-session");
    expect(session.ok()).toBeTruthy();
    const body = await session.json().catch(() => null);
    expect(body, "expected get-session to return a non-null session body").not.toBeNull();
    expect(body?.user?.id).toBeTruthy();
  });
});
