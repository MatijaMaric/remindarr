import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

/**
 * Calendar page POM.
 *
 * Non-DOM notes:
 * - CalendarPage at /calendar renders a GridCalendar (default), Agenda, or
 *   Week view. Tests use desktop viewport (1280x720) to ensure grid view renders
 *   (mobile renders MobileCalendar).
 * - GridCalendar calls GET /api/calendar?month=YYYY-MM on mount.
 * - GridCalendar also calls GET /api/user/settings/crowded-weeks on mount.
 * - App shell background components need mocks for subscriptions, achievements/me,
 *   recommendations/count, and suggestions to avoid auth:unauthorized events.
 * - Episode pills in the grid show "S{n}E{n} {show_title}" text.
 * - The page heading is the current month name, e.g. "May 2026".
 */
export class CalendarPage extends BasePage {
  async gotoCalendar(): Promise<void> {
    await this.goto("/calendar");
  }

  /**
   * Stub all shell endpoints needed for an authenticated visit to /calendar.
   * Does NOT mock /api/calendar or /api/user/settings/crowded-weeks — tests
   * register those themselves. Call before navigating.
   */
  async mockCalendarShellEndpoints(): Promise<void> {
    // AuthContext post-auth call
    await this.page.route("**/api/user/settings/subscriptions**", (route) =>
      route.fulfill({ json: { providerIds: [] } }),
    );
    // AchievementToast background polling
    await this.page.route("**/api/achievements/me**", (route) =>
      route.fulfill({ json: [] }),
    );
    // Nav recommendations count badge
    await this.page.route("**/api/recommendations/count**", (route) =>
      route.fulfill({ json: { count: 0 } }),
    );
    // SuggestedForYouRow (not rendered on calendar page but stub for safety)
    await this.page.route("**/api/suggestions**", (route) =>
      route.fulfill({ json: { flat: [], bySource: {} } }),
    );
    // Crowded week settings — return safe defaults
    await this.page.route("**/api/user/settings/crowded-weeks**", (route) =>
      route.fulfill({
        json: { crowdedWeekThreshold: 5, crowdedWeekBadgeEnabled: 0 },
      }),
    );
  }

  /** The month heading rendered by PageHeader, e.g. "May 2026". */
  monthHeading() {
    return this.page.getByRole("heading", { level: 1 });
  }
}

// ── Calendar API fixtures ─────────────────────────────────────────────────────

/** Build a date string N days from today in YYYY-MM-DD format. */
export function dateFromToday(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split("T")[0];
}

/** Standard single-episode calendar response. */
export function mockCalendarSingle(
  titleId = "tv-98765",
  showTitle = "Test Show",
) {
  const tomorrow = dateFromToday(1);
  return {
    titles: [],
    episodes: [
      {
        id: 102,
        title_id: titleId,
        season_number: 1,
        episode_number: 2,
        name: "Second Episode",
        overview: "The second episode",
        air_date: tomorrow,
        still_path: null,
        show_title: showTitle,
        poster_url: null,
        is_watched: false,
        offers: [],
      },
    ],
    count: 1,
  };
}

/** Two-show calendar response for grouping tests. */
export function mockCalendarMultiShow() {
  const dateA = dateFromToday(1);
  const dateB = dateFromToday(8);
  return {
    titles: [],
    episodes: [
      {
        id: 201,
        title_id: "tv-111",
        season_number: 2,
        episode_number: 3,
        name: "Part One",
        air_date: dateA,
        show_title: "Alpha Show",
        poster_url: null,
        is_watched: false,
        offers: [],
        still_path: null,
        overview: "",
      },
      {
        id: 202,
        title_id: "tv-111",
        season_number: 2,
        episode_number: 4,
        name: "Part Two",
        air_date: dateA,
        show_title: "Alpha Show",
        poster_url: null,
        is_watched: false,
        offers: [],
        still_path: null,
        overview: "",
      },
      {
        id: 203,
        title_id: "tv-222",
        season_number: 1,
        episode_number: 1,
        name: "Premiere",
        air_date: dateB,
        show_title: "Beta Show",
        poster_url: null,
        is_watched: false,
        offers: [],
        still_path: null,
        overview: "",
      },
    ],
    count: 3,
  };
}
