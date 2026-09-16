import { expect, test } from "@playwright/test";

test("public share HTML keeps a signup-created markup-bearing display name inert", async ({
  request,
  page,
}) => {
  const payload =
    '\"><script data-share-injection>document.documentElement.dataset.shareInjected="yes"</script><meta content="';
  const signup = await request.post("/api/auth/sign-up/email", {
    data: {
      username: "share_security_user",
      displayUsername: payload,
      name: "Synthetic share user",
      email: "share-security@example.test",
      password: "synthetic-browser-password",
    },
  });
  expect(signup.ok()).toBe(true);
  const share = await request.post("/api/share/token");
  expect(share.ok()).toBe(true);
  const { token } = await share.json();
  // The page uses a separate, anonymous browser context from the API fixture.
  expect(await page.context().cookies()).toHaveLength(0);
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === "http://localhost:3139")
      return route.continue();
    return route.abort();
  });
  const response = await page.goto(`/share/watchlist/${token}`);
  expect(response?.status()).toBe(200);
  await expect(
    page.locator('meta[property="og:title"]').last(),
  ).toHaveAttribute("content", `${payload}'s Watchlist — Remindarr`);
  await expect(page.locator("script[data-share-injection]")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-share-injected",
    "yes",
  );
  expect(
    await page.evaluate(() => document.documentElement.dataset.shareInjected),
  ).toBeUndefined();
});
