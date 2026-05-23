import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

/**
 * Browse page POM.
 *
 * Non-DOM notes:
 * - The browse page at `/browse` is publicly accessible — no RequireAuth wrapper.
 * - CategoryBrowse calls GET /api/browse?category=popular&page=1 on load.
 *   The glob pattern catches all variants (with query params).
 * - loadFilters calls genres/providers/languages in parallel on mount.
 * - Filter dropdowns (Genre, Provider) are FilterField components: clicking the
 *   summary button toggles an absolutely-positioned checklist panel.
 *   Each option is a label wrapping an input[type=checkbox].
 * - Active filter chips are button elements with text like "Action x".
 * - Category tabs use the Pill component which renders as a button.
 * - Title cards render as article[aria-label={title.title}].
 * - The BrowseFilterCard type group uses role="group" aria-label="Content type".
 */
export class BrowsePage extends BasePage {
  async gotoBrowse(): Promise<void> {
    await this.goto("/browse");
  }

  /**
   * Mock all filter-data endpoints (genres, providers, languages) and the
   * browse results endpoint with a single title: "Test Movie" (id "movie-12345").
   * Call this before navigating. Register more specific browse route mocks AFTER
   * this call so they win (Playwright applies routes LIFO).
   */
  async mockBrowseDataEndpoints(): Promise<void> {
    await this.page.route("**/api/titles/genres", (route) =>
      route.fulfill({
        json: { genres: ["Action", "Drama", "Comedy"] },
      }),
    );
    await this.page.route("**/api/titles/providers", (route) =>
      route.fulfill({
        json: {
          providers: [
            {
              id: 8,
              name: "Netflix",
              technical_name: "netflix",
              icon_url: "",
            },
          ],
          regionProviderIds: [8],
        },
      }),
    );
    await this.page.route("**/api/titles/languages", (route) =>
      route.fulfill({
        json: { languages: ["en", "es"], priorityLanguageCodes: ["en"] },
      }),
    );
    await this.page.route("**/api/browse**", (route) =>
      route.fulfill({
        json: {
          titles: [MOCK_BROWSE_TITLE],
          page: 1,
          totalPages: 1,
          totalResults: 1,
        },
      }),
    );
  }

  browseHeading() {
    return this.page.getByRole("heading", { name: "Browse" });
  }

  categoryButton(name: string) {
    return this.page.getByRole("button", { name, exact: true });
  }

  genreDropdownButton() {
    return this.page.getByRole("button", { name: /All genres/i });
  }

  providerDropdownButton() {
    return this.page.getByRole("button", { name: /All providers/i });
  }

  contentTypeGroup() {
    return this.page.getByRole("group", { name: /Content type/i });
  }

  titleCard(name: string) {
    return this.page.getByRole("article", { name });
  }

  /**
   * Active filter chips have aria-label="Remove X filter" but display text "X x".
   * Use getByText for the visible label (the "x" is the Unicode multiplication sign).
   */
  activeFilterChip(displayText: string) {
    return this.page.getByText(displayText, { exact: true });
  }
}

/** Standard browse fixture — matches the camelCase SearchTitle shape returned by /api/browse. */
export const MOCK_BROWSE_TITLE = {
  id: "movie-12345",
  objectType: "MOVIE",
  title: "Test Movie",
  originalTitle: "Test Movie",
  releaseYear: 2024,
  releaseDate: "2024-06-15",
  runtimeMinutes: 120,
  shortDescription: "A test movie",
  genres: ["Action"],
  imdbId: "tt1234567",
  tmdbId: 12345,
  posterUrl: null,
  ageCertification: "PG-13",
  originalLanguage: "en",
  tmdbUrl: "https://www.themoviedb.org/movie/12345",
  offers: [],
  scores: { imdbScore: 7.5, imdbVotes: 10000, tmdbScore: 7.8 },
  isTracked: false,
};

/** Browse fixture for an Action-genre filter result. */
export const MOCK_ACTION_TITLE = {
  ...MOCK_BROWSE_TITLE,
  id: "movie-99999",
  title: "Action Movie",
  originalTitle: "Action Movie",
};

/** Browse fixture for a Netflix provider filter result. */
export const MOCK_NETFLIX_TITLE = {
  ...MOCK_BROWSE_TITLE,
  id: "movie-88888",
  title: "Netflix Movie",
  originalTitle: "Netflix Movie",
  offers: [
    {
      provider_id: 8,
      provider_name: "Netflix",
      provider_technical_name: "netflix",
      provider_icon_url: "",
      monetization_type: "FLATRATE",
      url: "https://netflix.com",
    },
  ],
};
