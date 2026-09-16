import { test, expect, type Page } from "@playwright/test";
import { registerUser, type RegisteredUser } from "./fixtures/auth";

async function signIn(
  page: Page,
  user: RegisteredUser,
  password = user.password,
) {
  const username = page.getByLabel("Username");
  if (!(await username.isVisible()))
    await page
      .getByRole("button", { name: /sign in with username instead/i })
      .click();
  await username.fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /^Sign In$/i }).click();
}

async function logout(page: Page) {
  await page.getByRole("link", { name: /^More/ }).click();
  await page.getByRole("button", { name: /log out|logout|sign out/i }).click();
  await expect(page).toHaveURL(/\/login/);
}

for (const serviceWorkers of ["block", "allow"] as const) {
  test.describe(`identity with service workers ${serviceWorkers}`, () => {
    test.use({ serviceWorkers });
    test("real providers switch accounts, cancel old reads, and clear another tab", async ({
      page,
      context,
      playwright,
    }) => {
      const aliceRequest = await playwright.request.newContext({
        baseURL: "http://localhost:4327",
      });
      const bobRequest = await playwright.request.newContext({
        baseURL: "http://localhost:4327",
      });
      const alice = await registerUser(aliceRequest);
      const bob = await registerUser(bobRequest);
      const writes: string[] = [];
      let expectedWrites = 0;
      context.on("request", (request) => {
        if (
          request.method() === "POST" &&
          /\/api\/(track|watched)\//.test(request.url())
        )
          writes.push(request.url());
      });
      expect(
        (
          await aliceRequest.post("/api/track/movie-901", {
            data: { notes: "Alice private synthetic note" },
          })
        ).ok(),
      ).toBe(true);
      expect(
        (await bobRequest.post("/api/track/movie-902", { data: {} })).ok(),
      ).toBe(true);
      await page.goto("/login");
      await signIn(page, alice, "incorrect-password");
      await expect(
        page.getByText(/invalid username or password|invalid credentials/i),
      ).toBeVisible();
      await signIn(page, alice);
      await page.getByRole("link", { name: "Tracked", exact: true }).click();
      await expect(
        page.getByText("Alice isolated title", { exact: true }).first(),
      ).toBeVisible();
      const sibling = await context.newPage();
      await sibling.goto("/tracked");
      await expect(
        sibling.getByText("Alice isolated title", { exact: true }).first(),
      ).toBeVisible();
      if (serviceWorkers === "allow") {
        await page.evaluate(async () => {
          await navigator.serviceWorker.ready;
        });
        await expect
          .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
          .toBe(true);
        // Warm a private endpoint through the actual production worker.
        expect(
          await page.evaluate(async () => (await fetch("/api/track")).text()),
        ).toContain("Alice private synthetic note");
        expect(
          await page.evaluate(
            async () => (await fetch("/api/titles/genres")).ok,
          ),
        ).toBe(true);
        // Simulate legacy caches from the previous worker version.
        await page.evaluate(async () => {
          const cache = await caches.open("api-tracked-vlegacy");
          await cache.put(
            "/api/track",
            new Response("Alice private synthetic note"),
          );
          const publicCache = await caches.open("api-static-vlegacy");
          await publicCache.put(
            "/api/titles/genres",
            new Response('{"genres":[]}'),
          );
          await new Promise<void>((resolve, reject) => {
            const request = indexedDB.open("workbox-background-sync");
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result;
              const tx = db.transaction("requests", "readwrite");
              for (const [queueName, path] of [
                ["track-queue", "/api/track/movie-901"],
                ["watched-queue", "/api/watched/movie-901"],
              ]) {
                tx.objectStore("requests").add({
                  queueName,
                  timestamp: Date.now(),
                  requestData: {
                    url: location.origin + path,
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: new TextEncoder().encode(
                      '{"notes":"Alice pending write"}',
                    ).buffer,
                  },
                });
              }
              tx.oncomplete = () => {
                db.close();
                resolve();
              };
              tx.onerror = () => {
                db.close();
                reject(tx.error);
              };
            };
          });
        });
      }
      // A read started with Alice's session must not resolve into Bob's tree.
      // Browser routing cannot intercept worker-owned fetches, so use the blocked
      // worker run for a deterministic held network response.
      let release: (() => void) | undefined;
      let held: Promise<void> | undefined;
      if (serviceWorkers === "block") {
        held = new Promise<void>((resolve) => {
          release = resolve;
        });
        let started!: () => void;
        const startedRequest = new Promise<void>((resolve) => {
          started = resolve;
        });
        await page.route("**/api/track", async (route) => {
          const response = await route.fetch();
          started();
          await held;
          await route.fulfill({ response }).catch(() => {});
        });
        await page.reload();
        await startedRequest;
      }
      await logout(page);
      await expect(
        sibling.getByText("Alice isolated title", { exact: true }),
      ).toHaveCount(0);
      expect(writes).toEqual([]);
      if (serviceWorkers === "allow") {
        const cachesAfterLogout = await page.evaluate(() => caches.keys());
        expect(cachesAfterLogout).not.toContain("api-tracked-vlegacy");
        expect(
          await page.evaluate(
            () =>
              new Promise<number>((resolve, reject) => {
                const request = indexedDB.open("workbox-background-sync");
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                  const db = request.result;
                  const count = db
                    .transaction("requests")
                    .objectStore("requests")
                    .count();
                  count.onsuccess = () => {
                    db.close();
                    resolve(count.result);
                  };
                };
              }),
          ),
        ).toBe(0);
        await context.setOffline(true);
        expect(
          await page.evaluate(async () => {
            try {
              return await (await fetch("/api/track")).text();
            } catch {
              return "unavailable";
            }
          }),
        ).toBe("unavailable");
        expect(
          await page.evaluate(
            async () => (await fetch("/api/titles/genres")).ok,
          ),
        ).toBe(true);
        expect(
          await page.evaluate(async () => {
            try {
              await fetch("/api/track/movie-901", {
                method: "POST",
                body: "{}",
              });
              return "sent";
            } catch {
              return "unavailable";
            }
          }),
        ).toBe("unavailable");
        await expect(
          page.getByText(/changes are not saved offline/),
        ).toBeVisible();
        // Chromium reports both the page and worker's failed network attempt.
        expectedWrites = writes.length;
        await context.setOffline(false);
      }
      release?.();
      await page.unrouteAll({ behavior: "wait" });
      await signIn(page, bob);
      await page.getByRole("link", { name: "Tracked", exact: true }).click();
      await expect(
        page.getByText("Bob isolated title", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        page.getByText("Alice isolated title", { exact: true }),
      ).toHaveCount(0);
      await expect(
        sibling.getByText("Alice isolated title", { exact: true }),
      ).toHaveCount(0);
      expect(writes).toHaveLength(expectedWrites);
      expect(
        await page.evaluate(async () => (await fetch("/api/track")).text()),
      ).not.toContain("Alice private synthetic note");
      if (serviceWorkers === "allow") {
        await sibling.close();
        await page.close();
        const reopened = await context.newPage();
        await reopened.goto("/tracked");
        await expect(
          reopened.getByText("Bob isolated title", { exact: true }).first(),
        ).toBeVisible();
        const bobTitles = await (await bobRequest.get("/api/track")).json();
        expect(
          bobTitles.titles.map((title: { id: string }) => title.id),
        ).toEqual(["movie-902"]);
        await expect(
          reopened.getByText("Alice isolated title", { exact: true }),
        ).toHaveCount(0);
      } else {
        await logout(page);
        await page.getByRole("link", { name: /^Sign up$/i }).click();
        const username = `identity_${Date.now()}`;
        await page.getByLabel("Username", { exact: true }).fill(username);
        await page
          .getByLabel("Email", { exact: true })
          .fill(`${username}@example.test`);
        await page.getByLabel(/Display name/i).fill("Fresh identity");
        await page
          .getByLabel("Password", { exact: true })
          .fill("Synthetic-password-123!");
        await page.getByRole("button", { name: /^Sign up$/i }).click();
        await page.getByRole("link", { name: /^More/ }).click();
        await expect(
          page.getByText("Fresh identity", { exact: true }),
        ).toBeVisible();
        expect(
          (
            await context.request.post("/api/auth/update-user", {
              data: { name: "Updated same identity" },
              headers: { Origin: "http://localhost:4327" },
            })
          ).ok(),
        ).toBe(true);
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await expect(
          page.getByText("Updated same identity", { exact: true }),
        ).toBeVisible();
        await page.getByRole("link", { name: "Tracked", exact: true }).click();
        await expect(
          page.getByText("Bob isolated title", { exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByText("Alice isolated title", { exact: true }),
        ).toHaveCount(0);
      }
      await aliceRequest.dispose();
      await bobRequest.dispose();
    });
  });
}
