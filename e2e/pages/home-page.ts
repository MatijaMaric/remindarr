import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

/**
 * Home page POM.
 *
 * Non-DOM notes:
 * - The home route renders `HomePage` which shows an unauthenticated landing
 *   hero when no session is present, or the authenticated sections layout when
 *   logged in.
 * - On desktop (≥ 640 px) the desktop layout renders; on mobile an entirely
 *   different `MobileFeedHome` component is shown and may redirect to `/reels`.
 *   Tests that use this POM should set viewport to 1280x720.
 * - The authenticated home fetches several endpoints in parallel (episodes,
 *   recommendations, homepage-layout, up-next, friends-loved, streak, movies).
 *   All must be mocked to avoid network calls.
 */
export class HomePage extends BasePage {
  async gotoHome(): Promise<void> {
    await this.goto("/");
  }

  /**
   * Stub all authenticated home data endpoints with empty/valid responses.
   * Stubs GET /api/episodes/upcoming with empty arrays by default.
   * To override, register your own episodes/upcoming route AFTER calling this
   * method — Playwright processes routes LIFO so the last registration wins.
   */
  async mockHomeDataEndpoints(): Promise<void> {
    await this.page.route("**/api/episodes/upcoming", (route) =>
      route.fulfill({
        json: { today: [], upcoming: [], unwatched: [] },
      }),
    );
    await this.page.route("**/api/recommendations**", (route) =>
      route.fulfill({ json: { recommendations: [], count: 0 } }),
    );
    // Real URL: /api/user/settings/homepage-layout
    await this.page.route("**/api/user/settings/homepage-layout**", (route) =>
      route.fulfill({
        json: {
          homepage_layout: [
            { id: "today", enabled: true },
            { id: "upcoming", enabled: true },
            { id: "up_next", enabled: true },
            { id: "friends_loved", enabled: true },
            { id: "movies_to_watch", enabled: true },
            { id: "upcoming_movies", enabled: true },
            { id: "streak", enabled: true },
          ],
        },
      }),
    );
    // Real URL: /api/up-next?limit=12
    await this.page.route("**/api/up-next**", (route) =>
      route.fulfill({ json: { items: [] } }),
    );
    // Real URL: /api/social/friends-loved?limit=20
    await this.page.route("**/api/social/friends-loved**", (route) =>
      route.fulfill({ json: { items: [] } }),
    );
    // Real URL: /api/streak/me
    await this.page.route("**/api/streak/me**", (route) =>
      route.fulfill({ json: null }),
    );
    // Real URL: /api/movies/tracking
    await this.page.route("**/api/movies/tracking**", (route) =>
      route.fulfill({ json: { to_watch: [], upcoming: [] } }),
    );
    // AuthContext calls getSubscriptions() after auth succeeds.
    // If unmocked it hits the real server with a fake userId and gets 401,
    // which triggers the auth:unauthorized event and logs the user out.
    await this.page.route("**/api/user/settings/subscriptions**", (route) =>
      route.fulfill({ json: { providerIds: [] } }),
    );
    // AchievementToast polls achievements in the background. Without this mock
    // it returns 401 and triggers auth:unauthorized (even though the component
    // catches the error, fetchJson dispatches the event first).
    await this.page.route("**/api/achievements/me**", (route) =>
      route.fulfill({ json: [] }),
    );
    // Catch-all for any remaining authenticated API calls that return 401.
    // This prevents unexpected logouts from unmocked background requests.
    await this.page.route("**/api/recommendations/count**", (route) =>
      route.fulfill({ json: { count: 0 } }),
    );
    // SuggestedForYouRow is always rendered at the bottom of HomePage and
    // calls /api/suggestions. Without this mock it returns 401 from the real
    // backend (fake userId), firing auth:unauthorized and logging the user out.
    await this.page.route("**/api/suggestions**", (route) =>
      route.fulfill({ json: { flat: [], bySource: {} } }),
    );
  }

  mainContent() {
    return this.page.locator("main");
  }

  heroHeading() {
    return this.page.getByRole("heading", {
      name: /track movies.*tv shows/i,
    });
  }

  signInLink() {
    return this.page.getByRole("link", { name: /sign in/i });
  }

  createAccountLink() {
    return this.page.getByRole("link", { name: /create account/i });
  }

  popularNowHeading() {
    return this.page.getByRole("heading", { name: /popular right now/i });
  }

  homeNavLink() {
    return this.page.getByRole("link", { name: /^home$/i });
  }
}
