import {
  describe,
  it,
  expect,
  mock,
  beforeEach,
  afterEach,
  spyOn,
} from "bun:test";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router";
// apiMock must be imported BEFORE the page component so the complete `../api`
// mock is registered before the component binds its api namespace.
import { apiMock, resetApiMock } from "../test-utils/apiMock";
import "../i18n";
import * as AuthContextModule from "../context/AuthContext";
import { ApiError } from "../lib/api-error";
import type { UserProfileResponse } from "../types";

const { default: UserProfilePage } = await import("./UserProfilePage");

function newTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 },
      mutations: { retry: false },
    },
  });
}

function renderPage() {
  return render(
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter initialEntries={["/user/alice"]}>
        <Routes>
          <Route path="/user/:username" element={<UserProfilePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const profileFixture: UserProfileResponse = {
  user: {
    id: "u2",
    username: "alice",
    display_name: "Alice",
    image: null,
    member_since: null,
    bio: null,
    country_code: null,
  },
  stats: {
    tracked_count: 0,
    watched_movies: 0,
    watched_episodes: 0,
    shows_completed: 0,
    shows_total: 0,
    total_watched_episodes: 0,
    total_released_episodes: 0,
  },
  overview: {
    tracked_count: 0,
    watched_movies: 0,
    watched_episodes: 0,
    shows_completed: 0,
    shows_total: 0,
    total_watched_episodes: 0,
    total_released_episodes: 0,
    tracked_movies: 0,
    tracked_shows: 0,
    watch_time_minutes: 0,
    watch_time_minutes_movies: 0,
    watch_time_minutes_shows: 0,
  },
  genres: [],
  monthly: [],
  shows_by_status: {
    watching: 0,
    caught_up: 0,
    completed: 0,
    not_started: 0,
    unreleased: 0,
    on_hold: 0,
    dropped: 0,
    plan_to_watch: 0,
  },
  friends: [],
  movies: [],
  shows: [],
  show_watchlist: false,
  profile_visibility: "public",
  activity_stream_enabled: false,
  is_own_profile: false,
  backdrops: [],
  follower_count: 0,
  following_count: 0,
  is_following: false,
  pinned: [],
};

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(AuthContextModule, "useAuth").mockReturnValue({
      user: {
        id: "u1",
        username: "testuser",
        display_name: null,
        auth_provider: "local",
        is_admin: false,
      },
      providers: { local: true, oidc: null },
      loading: false,
      sessionStatus: "authenticated",
      subscriptions: null,
      refreshSubscriptions: mock(() => Promise.resolve()),
      login: mock(() => Promise.resolve()),
      signup: mock(() => Promise.resolve()),
      logout: mock(() => Promise.resolve()),
      refresh: mock(() => Promise.resolve()),
    }),
  ];
});

afterEach(() => {
  cleanup();
  resetApiMock();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("UserProfilePage error handling", () => {
  it("renders 'User not found' without a Retry button on 404", async () => {
    apiMock.getUserProfile.mockImplementation(() =>
      Promise.reject(new ApiError("User not found", 404)),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("User not found")).toBeDefined();
    });
    expect(screen.queryByText("Retry")).toBeNull();
    expect(screen.queryByText("Failed to load profile")).toBeNull();
  });

  it("renders 'Failed to load profile' with a Retry button on 500", async () => {
    apiMock.getUserProfile.mockImplementation(() =>
      Promise.reject(new ApiError("Internal server error", 500)),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Failed to load profile")).toBeDefined();
    });
    expect(screen.getByText("Retry")).toBeDefined();
    expect(screen.queryByText("User not found")).toBeNull();
  });

  it("refetches the profile when Retry is clicked and renders it on success", async () => {
    // The page's query retries non-404 errors once, so the first TWO calls
    // must fail for the error UI to appear; later calls succeed.
    let calls = 0;
    apiMock.getUserProfile.mockImplementation(() => {
      calls += 1;
      if (calls <= 2) {
        return Promise.reject(new ApiError("Internal server error", 500));
      }
      return Promise.resolve(profileFixture);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeDefined();
    });
    const callsBeforeRetry = apiMock.getUserProfile.mock.calls.length;

    fireEvent.click(screen.getByText("Retry"));

    await waitFor(() => {
      expect(screen.getByTestId("profile-hero")).toBeDefined();
    });
    expect(apiMock.getUserProfile.mock.calls.length).toBeGreaterThan(
      callsBeforeRetry,
    );
    expect(screen.getByText("@alice")).toBeDefined();
    expect(screen.queryByText("Failed to load profile")).toBeNull();
  });
});
