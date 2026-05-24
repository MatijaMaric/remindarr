import { test } from "@playwright/test";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
import {
  VIEWPORTS,
  UX_ARTIFACTS_DIR,
  UX_MANIFEST_PATH,
  UX_AUTH_STATE_PATH,
} from "./constants";
import type { UxManifest } from "./constants";
import { resolveRoutes } from "./routes";
import type { UxRoute } from "./routes";
import { PERSON_FIXTURE, PERSON_ID } from "./fixtures/person";

// Static route stubs — defined at module-load time (before globalSetup runs).
// Manifest-dependent paths are resolved inside each test body after globalSetup writes manifest.json.
type AuthCtx = "public" | "authed";
const ROUTE_STUBS: Array<{ slug: string; authContext: AuthCtx }> = [
  // public
  { slug: "login", authContext: "public" },
  { slug: "signup", authContext: "public" },
  { slug: "browse", authContext: "public" },
  { slug: "title-movie", authContext: "public" },
  { slug: "title-show", authContext: "public" },
  { slug: "season-detail", authContext: "public" },
  { slug: "episode-detail", authContext: "public" },
  { slug: "person", authContext: "public" },
  { slug: "user-profile", authContext: "public" },
  { slug: "user-achievements-public", authContext: "public" },
  { slug: "achievement-detail-public", authContext: "public" },
  { slug: "shared-watchlist", authContext: "public" },
  { slug: "kiosk", authContext: "public" },
  { slug: "not-found", authContext: "public" },
  // authed
  { slug: "home", authContext: "authed" },
  { slug: "reels", authContext: "authed" },
  { slug: "more", authContext: "authed" },
  { slug: "tracked", authContext: "authed" },
  { slug: "tracked-stats", authContext: "authed" },
  { slug: "calendar", authContext: "authed" },
  { slug: "discovery", authContext: "authed" },
  { slug: "invite", authContext: "authed" },
  { slug: "leaderboard", authContext: "authed" },
  { slug: "achievements", authContext: "authed" },
  { slug: "achievement-detail", authContext: "authed" },
  { slug: "user-overlap", authContext: "authed" },
  { slug: "settings", authContext: "authed" },
  { slug: "admin-users", authContext: "authed" },
];

function readManifest(): UxManifest {
  return JSON.parse(fs.readFileSync(UX_MANIFEST_PATH, "utf-8")) as UxManifest;
}

function lookupRoute(slug: string, manifest: UxManifest): UxRoute {
  const route = resolveRoutes(manifest).find((r) => r.slug === slug);
  if (!route) throw new Error(`Route slug not found: ${slug}`);
  return route;
}

async function captureRoute(page: Page, route: UxRoute): Promise<void> {
  if (route.mockPerson) {
    await page.route(`**/api/details/person/${PERSON_ID}`, (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ person: PERSON_FIXTURE }),
      }),
    );
  }

  for (const vp of VIEWPORTS) {
    const dir = path.resolve(UX_ARTIFACTS_DIR, route.slug);
    fs.mkdirSync(dir, { recursive: true });

    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(route.path, { waitUntil: "networkidle", timeout: 30_000 });

    await page.screenshot({
      path: path.join(dir, `${vp.label}.png`),
      fullPage: true,
    });

    const results = await new AxeBuilder({ page }).analyze();
    fs.writeFileSync(
      path.join(dir, `${vp.label}.axe.json`),
      JSON.stringify(results.violations, null, 2),
    );
  }
}

// ── Public routes (no session cookie) ────────────────────────────────────────

const publicStubs = ROUTE_STUBS.filter((r) => r.authContext === "public");

test.describe("public routes", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const stub of publicStubs) {
    test(`capture ${stub.slug}`, async ({ page }) => {
      const manifest = readManifest();
      await captureRoute(page, lookupRoute(stub.slug, manifest));
    });
  }
});

// ── Authenticated routes ──────────────────────────────────────────────────────

const authedStubs = ROUTE_STUBS.filter((r) => r.authContext === "authed");

test.describe("authed routes", () => {
  test.use({ storageState: UX_AUTH_STATE_PATH });

  for (const stub of authedStubs) {
    test(`capture ${stub.slug}`, async ({ page }) => {
      const manifest = readManifest();
      await captureRoute(page, lookupRoute(stub.slug, manifest));
    });
  }
});
