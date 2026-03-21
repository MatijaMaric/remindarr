import type { Page } from "@playwright/test";

// ─── Mock data ────────────────────────────────────────────────────────────────

export const MOCK_USER = {
  id: "user-1",
  name: "Test User",
  email: "test@example.com",
  username: "testuser",
  role: "user",
};

export const MOCK_SESSION = {
  session: {
    id: "session-1",
    userId: "user-1",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    token: "mock-session-token",
  },
  user: MOCK_USER,
};

export const MOCK_PROVIDERS = {
  local: true,
  oidc: null,
};

export const MOCK_OIDC_PROVIDERS = {
  local: true,
  oidc: { name: "PocketID", providerId: "pocketid" },
};

export const MOCK_TITLE = {
  id: "tt1234567",
  object_type: "MOVIE",
  title: "Test Movie",
  original_title: "Test Movie",
  release_year: 2024,
  release_date: "2024-01-15",
  runtime_minutes: 120,
  short_description: "A test movie description",
  genres: ["Action", "Drama"],
  imdb_id: "tt1234567",
  tmdb_id: 12345,
  poster_url: null,
  age_certification: "PG-13",
  original_language: "en",
  tmdb_url: "https://www.themoviedb.org/movie/12345",
  imdb_score: 7.5,
  imdb_votes: 10000,
  tmdb_score: 7.8,
  is_tracked: false,
  offers: [],
};

export const MOCK_TRACKED_TITLE = {
  ...MOCK_TITLE,
  is_tracked: true,
  tracked_at: "2024-01-10T00:00:00Z",
};

export const MOCK_SHOW = {
  id: "tt9876543",
  object_type: "SHOW",
  title: "Test Show",
  original_title: "Test Show",
  release_year: 2023,
  release_date: "2023-03-01",
  runtime_minutes: 45,
  short_description: "A test show description",
  genres: ["Drama"],
  imdb_id: "tt9876543",
  tmdb_id: 98765,
  poster_url: null,
  age_certification: "TV-MA",
  original_language: "en",
  tmdb_url: "https://www.themoviedb.org/tv/98765",
  imdb_score: 8.2,
  imdb_votes: 50000,
  tmdb_score: 8.5,
  is_tracked: false,
  offers: [],
};

const today = new Date().toISOString().split("T")[0];
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];

export const MOCK_EPISODE = {
  id: 101,
  title_id: "tt9876543",
  season_number: 1,
  episode_number: 1,
  name: "Pilot",
  overview: "The first episode",
  air_date: today,
  still_path: null,
  show_title: "Test Show",
  poster_url: null,
  is_watched: false,
  offers: [],
};

export const MOCK_UPCOMING_EPISODE = {
  id: 102,
  title_id: "tt9876543",
  season_number: 1,
  episode_number: 2,
  name: "Second Episode",
  overview: "The second episode",
  air_date: tomorrow,
  still_path: null,
  show_title: "Test Show",
  poster_url: null,
  is_watched: false,
  offers: [],
};

export const MOCK_SEARCH_TITLE = {
  id: "tt1234567",
  objectType: "MOVIE",
  title: "Test Movie",
  originalTitle: "Test Movie",
  releaseYear: 2024,
  releaseDate: "2024-01-15",
  runtimeMinutes: 120,
  shortDescription: "A test movie description",
  genres: ["Action", "Drama"],
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

export const MOCK_MOVIE_DETAILS = {
  title: MOCK_TITLE,
  tmdb: {
    id: 12345,
    title: "Test Movie",
    overview: "A test movie description",
    release_date: "2024-01-15",
    runtime: 120,
    genres: [{ id: 28, name: "Action" }, { id: 18, name: "Drama" }],
    vote_average: 7.8,
    vote_count: 5000,
    poster_path: null,
    backdrop_path: null,
    status: "Released",
    budget: 50000000,
    revenue: 120000000,
    tagline: "A great movie",
    credits: { cast: [], crew: [] },
    release_dates: { results: [] },
    watch_providers: { results: {} },
    keywords: { keywords: [] },
    imdb_id: "tt1234567",
  },
};

export const MOCK_SHOW_DETAILS = {
  title: MOCK_SHOW,
  tmdb: {
    id: 98765,
    name: "Test Show",
    overview: "A test show description",
    first_air_date: "2023-03-01",
    episode_run_time: [45],
    genres: [{ id: 18, name: "Drama" }],
    vote_average: 8.5,
    vote_count: 20000,
    poster_path: null,
    backdrop_path: null,
    status: "Returning Series",
    number_of_seasons: 1,
    number_of_episodes: 8,
    tagline: "A great show",
    credits: { cast: [], crew: [] },
    watch_providers: { results: {} },
    seasons: [
      {
        id: 1,
        season_number: 1,
        name: "Season 1",
        episode_count: 8,
        air_date: "2023-03-01",
        overview: "Season 1",
        poster_path: null,
      },
    ],
    keywords: { results: [] },
    external_ids: { imdb_id: "tt9876543" },
  },
};

// ─── Auth helpers ─────────────────────────────────────────────────────────────

/**
 * Sets up route mocks for a logged-out user.
 */
export async function mockLoggedOut(page: Page) {
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ json: null })
  );
  await page.route("**/api/auth/custom/providers", (route) =>
    route.fulfill({ json: MOCK_PROVIDERS })
  );
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({ json: { csrfToken: "mock-csrf-token" } })
  );
}

/**
 * Sets up route mocks for a logged-in user.
 */
export async function mockLoggedIn(page: Page) {
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ json: MOCK_SESSION })
  );
  await page.route("**/api/auth/custom/providers", (route) =>
    route.fulfill({ json: MOCK_PROVIDERS })
  );
}

// ─── API helpers ──────────────────────────────────────────────────────────────

/**
 * Mocks common title list endpoints.
 * Note: more specific routes are registered last so they take precedence
 * (Playwright applies routes in reverse registration order).
 */
export async function mockTitleEndpoints(
  page: Page,
  titles = [MOCK_TITLE]
) {
  // General titles route registered first (lower precedence)
  await page.route("**/api/titles**", (route) =>
    route.fulfill({ json: { titles, count: titles.length } })
  );
  // Specific sub-routes registered last (higher precedence)
  await page.route("**/api/titles/providers", (route) =>
    route.fulfill({ json: { providers: [] } })
  );
  await page.route("**/api/titles/genres", (route) =>
    route.fulfill({ json: { genres: ["Action", "Drama", "Comedy"] } })
  );
  await page.route("**/api/titles/languages", (route) =>
    route.fulfill({ json: { languages: ["en", "es", "fr"] } })
  );
}

/**
 * Mocks the browse endpoint.
 */
export async function mockBrowseEndpoints(page: Page) {
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
    })
  );
}
