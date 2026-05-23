import { test, expect } from "@playwright/test";
import { mockLoggedOut, mockLoggedIn } from "./helpers";
import { ProfilePage } from "./pages/profile-page";

test.describe.configure({ mode: "serial" });

const OWN_PROFILE_RESPONSE = {
  user: {
    id: "user-1",
    username: "testuser",
    display_name: "Test User",
    image: null,
    member_since: "2024-01-01T00:00:00Z",
    bio: "Hello, I love movies.",
    country_code: null,
  },
  stats: {
    tracked_count: 12,
    watched_movies: 5,
    watched_episodes: 42,
    shows_completed: 2,
    shows_total: 4,
    total_watched_episodes: 42,
    total_released_episodes: 60,
  },
  overview: {
    tracked_count: 12,
    tracked_movies: 5,
    tracked_shows: 7,
    watched_movies: 5,
    watched_episodes: 42,
    shows_completed: 2,
    shows_total: 4,
    total_watched_episodes: 42,
    total_released_episodes: 60,
    watch_time_minutes: 1800,
    watch_time_minutes_movies: 600,
    watch_time_minutes_shows: 1200,
  },
  genres: [],
  monthly: [],
  shows_by_status: {
    watching: 2,
    caught_up: 1,
    completed: 2,
    not_started: 1,
    unreleased: 0,
    on_hold: 0,
    dropped: 0,
    plan_to_watch: 1,
  },
  friends: [],
  movies: [],
  shows: [],
  show_watchlist: true,
  profile_visibility: "public",
  activity_stream_enabled: true,
  is_own_profile: true,
  backdrops: [],
  follower_count: 3,
  following_count: 5,
  is_following: false,
  pinned: [],
};

const ALICE_PROFILE_RESPONSE = {
  user: {
    id: "user-2",
    username: "alice",
    display_name: "Alice",
    image: null,
    member_since: "2024-03-10T00:00:00Z",
    bio: null,
    country_code: null,
  },
  stats: {
    tracked_count: 20,
    watched_movies: 10,
    watched_episodes: 80,
    shows_completed: 5,
    shows_total: 8,
    total_watched_episodes: 80,
    total_released_episodes: 100,
  },
  overview: {
    tracked_count: 20,
    tracked_movies: 8,
    tracked_shows: 12,
    watched_movies: 10,
    watched_episodes: 80,
    shows_completed: 5,
    shows_total: 8,
    total_watched_episodes: 80,
    total_released_episodes: 100,
    watch_time_minutes: 3000,
    watch_time_minutes_movies: 1000,
    watch_time_minutes_shows: 2000,
  },
  genres: [],
  monthly: [],
  shows_by_status: {
    watching: 3,
    caught_up: 2,
    completed: 5,
    not_started: 2,
    unreleased: 0,
    on_hold: 0,
    dropped: 0,
    plan_to_watch: 0,
  },
  friends: [],
  movies: [],
  shows: [],
  show_watchlist: true,
  profile_visibility: "public",
  activity_stream_enabled: true,
  is_own_profile: false,
  backdrops: [],
  follower_count: 10,
  following_count: 4,
  is_following: false,
  pinned: [],
};

async function setupOwnProfileMocks(page: ProfilePage["page"]) {
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/user/testuser/activity**", (route) =>
    route.fulfill({
      json: { activities: [], has_more: false, next_cursor: null },
    }),
  );
  await page.route("**/api/streak/me", (route) =>
    route.fulfill({
      json: { currentStreak: 0, longestStreak: 0, lastWatchDate: null },
    }),
  );
  await page.route("**/api/achievements/me", (route) =>
    route.fulfill({ json: { achievements: [] } }),
  );
  await page.route("**/api/user/testuser", (route) =>
    route.fulfill({ json: OWN_PROFILE_RESPONSE }),
  );
}

async function setupAliceProfileMocks(page: ProfilePage["page"]) {
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/user/alice/activity**", (route) =>
    route.fulfill({
      json: { activities: [], has_more: false, next_cursor: null },
    }),
  );
  await page.route("**/api/achievements/u/alice", (route) =>
    route.fulfill({ json: { achievements: [] } }),
  );
  await page.route("**/api/user/alice", (route) =>
    route.fulfill({ json: ALICE_PROFILE_RESPONSE }),
  );
}

test.describe("Profile page", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Running on chromium only",
  );

  test("TC-01: own profile loads — username, display name, and follow stats visible", async ({
    page,
  }) => {
    const pp = new ProfilePage(page);
    await setupOwnProfileMocks(page);
    await mockLoggedIn(page);
    await pp.gotoUser("testuser");
    await pp.waitForVisible(pp.profileHero());

    await expect(pp.heading()).toHaveText("Test User");
    await expect(pp.usernameLabel("testuser")).toBeVisible();

    // Follower / following counts inside the social bar
    const socialBar = pp.socialBar();
    await expect(socialBar.getByText("3")).toBeVisible();
    await expect(socialBar.getByText("5")).toBeVisible();

    // No error
    await expect(page.getByText("User not found")).not.toBeVisible();
    // No Follow button on own profile
    await expect(pp.followButton()).not.toBeVisible();
  });

  test("TC-02: unauthenticated access to /profile redirects to /login", async ({
    page,
  }) => {
    const pp = new ProfilePage(page);
    await mockLoggedOut(page);
    await pp.gotoProfile();
    await page.waitForURL("**/login**", { waitUntil: "commit" });

    expect(page.url()).toContain("/login");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    await expect(pp.profileHero()).not.toBeVisible();
  });

  test("TC-03: view another user's profile — their username visible", async ({
    page,
  }) => {
    const pp = new ProfilePage(page);
    await setupAliceProfileMocks(page);
    await mockLoggedIn(page);
    await pp.gotoUser("alice");
    await pp.waitForVisible(pp.profileHero());

    await expect(pp.heading()).toHaveText("Alice");
    await expect(pp.usernameLabel("alice")).toBeVisible();
    await expect(pp.socialBar().getByText("10")).toBeVisible();
    await expect(page.getByText("User not found")).not.toBeVisible();
  });

  test("TC-04: follow button visible on another user's profile and functional", async ({
    page,
  }) => {
    const pp = new ProfilePage(page);
    // Stateful: after follow POST, re-fetch returns is_following: true
    let isFollowing = false;
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await page.route("**/api/user/alice/activity**", (route) =>
      route.fulfill({
        json: { activities: [], has_more: false, next_cursor: null },
      }),
    );
    await page.route("**/api/achievements/u/alice", (route) =>
      route.fulfill({ json: { achievements: [] } }),
    );
    await page.route("**/api/social/follow/user-2", (route) => {
      isFollowing = true;
      route.fulfill({ status: 200, json: {} });
    });
    await page.route("**/api/user/alice", (route) =>
      route.fulfill({
        json: { ...ALICE_PROFILE_RESPONSE, is_following: isFollowing },
      }),
    );
    await mockLoggedIn(page);
    await pp.gotoUser("alice");
    await pp.waitForVisible(pp.profileHero());

    // Follow button present before click
    await expect(pp.followButton()).toBeVisible();

    await pp.followButton().click();
    // Move mouse away so hover state clears
    await page.mouse.move(0, 0);

    // Optimistic update: button changes to Following or Unfollow (hover)
    await expect(
      page.getByRole("button", { name: /Following|Unfollow/i }).first(),
    ).toBeVisible();
  });

  test("TC-05: achievements section visible when earned achievements present", async ({
    page,
  }) => {
    const pp = new ProfilePage(page);
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await page.route("**/api/user/testuser/activity**", (route) =>
      route.fulfill({
        json: { activities: [], has_more: false, next_cursor: null },
      }),
    );
    await page.route("**/api/streak/me", (route) =>
      route.fulfill({
        json: { currentStreak: 0, longestStreak: 0, lastWatchDate: null },
      }),
    );
    await page.route("**/api/achievements/me", (route) =>
      route.fulfill({
        json: {
          achievements: [
            {
              key: "first_movie",
              kind: "count_movies",
              title: "First Watch",
              description: "Watch your first movie",
              icon: "Film",
              threshold: 1,
              points: 10,
              category: "watching",
              tier: "one-shot",
              repeatable: false,
              family: null,
              rungIndex: null,
              progress: 1,
              earned: true,
              earnedAt: "2024-03-01T12:00:00Z",
              earnedCount: 1,
              lastEarnedAt: "2024-03-01T12:00:00Z",
              nextRung: null,
              rarity: null,
            },
          ],
        },
      }),
    );
    await page.route("**/api/user/testuser", (route) =>
      route.fulfill({ json: OWN_PROFILE_RESPONSE }),
    );
    await mockLoggedIn(page);
    await pp.gotoUser("testuser");
    await pp.waitForVisible(pp.profileHero());

    await expect(pp.achievementsKicker()).toBeVisible();
    // "1/1 · 10 XP"
    await expect(page.getByText(/1\/1/)).toBeVisible();
    await expect(pp.viewAllAchievementsLink()).toHaveAttribute(
      "href",
      "/achievements",
    );
  });

  test("TC-06: profile stats (watch time, tracked titles) visible in sidebar", async ({
    page,
  }) => {
    const pp = new ProfilePage(page);
    await setupOwnProfileMocks(page);
    await mockLoggedIn(page);
    await pp.gotoUser("testuser");
    await pp.waitForVisible(pp.profileHero());

    await expect(pp.progressKicker()).toBeVisible();
    // Episodes: 42/60
    await expect(page.getByText("42/60")).toBeVisible();
    // Watch time: 1800 min = 30h
    await expect(page.getByText("30h")).toBeVisible();
    // Tracked count: 12
    await expect(page.getByText("12").first()).toBeVisible();
  });

  test("TC-07: Watch together link present on another user's profile", async ({
    page,
  }) => {
    const pp = new ProfilePage(page);
    await setupAliceProfileMocks(page);
    await mockLoggedIn(page);
    await pp.gotoUser("alice");
    await pp.waitForVisible(pp.profileHero());

    const watchLink = pp.watchTogetherLink();
    await expect(watchLink).toBeVisible();
    await expect(watchLink).toHaveAttribute(
      "href",
      "/u/testuser/overlap/alice",
    );
  });

  test("TC-08: profile with hidden watchlist shows privacy message", async ({
    page,
  }) => {
    const pp = new ProfilePage(page);
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await page.route("**/api/achievements/u/alice", (route) =>
      route.fulfill({ json: { achievements: [] } }),
    );
    await page.route("**/api/user/alice", (route) =>
      route.fulfill({
        json: {
          ...ALICE_PROFILE_RESPONSE,
          show_watchlist: false,
          profile_visibility: "private",
        },
      }),
    );
    await mockLoggedIn(page);
    await pp.gotoUser("alice");
    await pp.waitForVisible(pp.profileHero());

    // Privacy message visible
    await expect(page.getByText(/watchlist is private/i)).toBeVisible();
    // Progress sidebar card not rendered (gated on show_watchlist)
    await expect(pp.progressKicker()).not.toBeVisible();
  });
});
