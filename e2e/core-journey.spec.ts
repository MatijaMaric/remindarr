import { test, expect, type TestInfo } from "@playwright/test";
import { CoreJourneyPage } from "./pages/core-journey-page";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Each synthetic journey has its own client address behind the loopback-only
// trusted proxy. Keep real per-client rate limits without sharing one bucket
// across unrelated accounts and browser projects.
function clientHeaders(info: TestInfo) {
  const browser =
    ["chromium", "firefox", "webkit"].indexOf(info.project.name) + 1;
  return { "X-Forwarded-For": `2001:db8:${browser}::${info.line}` };
}
test.use({
  extraHTTPHeaders: async ({}, use, info) => use(clientHeaders(info)),
});

test("real signup, search, track, watch, library and Stats survive refresh", async ({
  page,
}) => {
  const app = new CoreJourneyPage(page);
  await app.signup();
  await app.search();
  await page
    .getByRole("button", { name: "Add to watchlist", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "In watchlist", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /mark.*watched/i })
    .first()
    .click();
  await app.library();
  await expect(
    page.getByRole("link", { name: /Synthetic Journey/ }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stats", exact: true }).click();
  await expect(page).toHaveURL(/view=stats/);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Stats", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const tracked = await (await page.request.get("/api/track")).json();
  expect(
    tracked.titles.some(
      (title: { title: string; is_watched: boolean }) =>
        title.title === "Synthetic Journey" && title.is_watched,
    ),
  ).toBe(true);
});

test("production worker retains offline intent and cached pages across a browser restart", async ({
  playwright,
  browserName,
}, testInfo) => {
  mkdirSync(".e2e", { recursive: true });
  const profile = mkdtempSync(resolve(".e2e/p-"));
  const context = await playwright[browserName].launchPersistentContext(
    profile,
    {
      baseURL: "http://localhost:4337",
      headless: true,
      extraHTTPHeaders: clientHeaders(testInfo),
    },
  );
  const page = await context.newPage();
  const app = new CoreJourneyPage(page);
  await app.signup();
  await app.search();
  const details = page.url();
  await page.goto("/tracked");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/calendar");
  await expect(page.getByRole("button", { name: "Next month" })).toBeVisible();
  await page.goto(details);
  await expect(
    page.getByRole("button", { name: "Add to watchlist", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "Add to watchlist", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Queued for sync", exact: true }),
  ).toBeVisible();
  await test.step("close browser with a durable queued write", () =>
    context.close());
  const resumed = await test.step("restart browser offline", () =>
    playwright[browserName].launchPersistentContext(profile, {
      baseURL: "http://localhost:4337",
      headless: true,
      offline: true,
      extraHTTPHeaders: clientHeaders(testInfo),
    }));
  const restarted = await resumed.newPage();
  try {
    await test.step("load private library from production service worker", () =>
      restarted.goto("http://localhost:4337/tracked"));
    await expect(restarted.getByText(/Reconnecting/)).toHaveCount(0);
    await expect(
      restarted.getByRole("heading", { name: /watchlist|tracked/i }).first(),
    ).toBeVisible();
    await restarted.goto("http://localhost:4337/calendar");
    await expect(
      restarted.getByRole("button", { name: "Next month" }),
    ).toBeVisible();
    await resumed.setOffline(false);
    await restarted.reload();
    await expect
      .poll(
        async () =>
          (await (await restarted.request.get("/api/track")).json()).count,
      )
      .toBe(1);
    await restarted.goto("http://localhost:4337/tracked");
    await expect(
      restarted.getByRole("link", { name: /Synthetic Journey/ }).first(),
    ).toBeVisible();
  } finally {
    await resumed.close();
  }
});

test("expired offline session cannot reveal cached private pages", async ({
  page,
  context,
}) => {
  const app = new CoreJourneyPage(page);
  await app.signup();
  await page.goto("/tracked");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("remindarr-offline-v1", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("state", "readwrite");
        const store = tx.objectStore("state");
        const read = store.get("session");
        read.onsuccess = () =>
          store.put({ ...read.result, expires: 1 }, "session");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/Reconnecting/)).toBeVisible();
  await expect(
    page.getByText("Reconnect to verify your account.", { exact: false }),
  ).toBeVisible();
});

test("sign-in recovery and export scope remain visible with large text", async ({
  page,
}) => {
  const app = new CoreJourneyPage(page);
  await page.goto("/login");
  const local = page.getByRole("button", { name: /username instead/i });
  await expect(
    page.getByLabel("Username", { exact: true }).or(local),
  ).toBeVisible();
  if (await local.isVisible()) await local.click();
  await page.getByText("Forgot your password?", { exact: true }).click();
  await expect(
    page.getByText(/Contact your instance administrator/),
  ).toBeVisible();
  await app.signup();
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/settings?tab=integrations");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect(
    page.getByText(/This is a watchlist export, not a complete account backup/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
});

test("a 500-title watchlist remains usable at a narrow viewport", async ({
  page,
}, testInfo) => {
  const app = new CoreJourneyPage(page);
  await app.signup();
  const titles = Array.from({ length: 500 }, (_, index) => ({
    id: `synthetic-${index}`,
    object_type: "MOVIE",
    title: `Synthetic library title ${index}`,
    release_year: 2020,
    genres: [],
  }));
  const imported = await page.request.post("/api/track/import", {
    data: { titles },
  });
  expect((await imported.json()).imported).toBe(500);
  await page.setViewportSize({ width: 390, height: 844 });
  const started = Date.now();
  await page.goto("/tracked");
  await expect(
    page.getByRole("link", { name: /Synthetic library title/ }).first(),
  ).toBeVisible();
  const timingPath = testInfo.outputPath("watchlist-render.json");
  writeFileSync(
    timingPath,
    JSON.stringify({
      titles: 500,
      viewport: "390x844",
      navigationToFirstTitleMs: Date.now() - started,
    }),
  );
  await testInfo.attach("watchlist-render.json", {
    path: timingPath,
    contentType: "application/json",
  });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
});

test("a changed account cannot receive the previous account's offline queue", async ({
  page,
  context,
  playwright,
}, testInfo) => {
  const app = new CoreJourneyPage(page);
  await app.signup();
  await app.search();
  await expect(
    page.getByRole("button", { name: "Add to watchlist", exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "Add to watchlist", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Queued for sync", exact: true }),
  ).toBeVisible();
  const replacement = await playwright.request.newContext({
    baseURL: "http://localhost:4337",
    extraHTTPHeaders: clientHeaders(testInfo),
  });
  try {
    const username = `replacement_${crypto.randomUUID().slice(0, 8)}`;
    const signup = await replacement.post("/api/auth/sign-up/email", {
      data: {
        username,
        name: username,
        email: `${username}@example.com`,
        password: "Synthetic-password-123",
      },
    });
    expect(signup.ok()).toBe(true);
    await context.clearCookies();
    await context.addCookies((await replacement.storageState()).cookies);
    await context.setOffline(false);
    await expect(
      page.getByRole("button", { name: "Add to watchlist", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Queued for sync", exact: true }),
    ).toHaveCount(0);
    const tracked = await replacement.get("/api/track");
    expect(tracked.ok()).toBe(true);
    expect((await tracked.json()).count).toBe(0);
  } finally {
    await replacement.dispose();
  }
});
