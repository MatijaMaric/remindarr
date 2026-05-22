import {
  describe,
  test,
  expect,
  spyOn,
  afterEach,
  beforeEach,
  mock,
} from "bun:test";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "../api";
import type { UserAchievement } from "../types";

// Mock AuthContext to avoid null context errors.
// Returns a full shape so cross-file leaks don't corrupt other tests.
mock.module("../context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "current-user",
      username: "me",
      display_name: "Me",
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
  AuthContext: {
    Provider: ({ children }: { children: ReactNode }) => children,
  },
}));

const { default: AchievementsPage } = await import("./AchievementsPage");

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

// Renders the page as the current user (own profile — /achievements)
function OwnWrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter initialEntries={["/achievements"]}>
        <Routes>
          <Route path="/achievements" element={<>{children}</>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// Renders the page as another user (/u/alice/achievements)
function OtherWrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter initialEntries={["/u/alice/achievements"]}>
        <Routes>
          <Route path="/u/:username/achievements" element={<>{children}</>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function makeAchievement(
  overrides: Partial<UserAchievement> = {},
): UserAchievement {
  return {
    key: "watch-1",
    kind: "watch_count",
    threshold: 10,
    points: 50,
    title: "First Watch",
    description: "Watch 10 titles",
    icon: "🎬",
    category: "watching",
    tier: "ladder",
    repeatable: false,
    family: "watch",
    rungIndex: 0,
    progress: 10,
    earned: true,
    earnedAt: "2025-01-01T00:00:00.000Z",
    earnedCount: 1,
    lastEarnedAt: "2025-01-01T00:00:00.000Z",
    nextRung: null,
    rarity: { pct: 60, bucket: "common" },
    ...overrides,
  };
}

let getMyAchievementsSpy: ReturnType<
  typeof spyOn<typeof api, "getMyAchievements">
>;
let getUserAchievementsSpy: ReturnType<
  typeof spyOn<typeof api, "getUserAchievements">
>;

beforeEach(() => {
  getMyAchievementsSpy = spyOn(api, "getMyAchievements");
  getUserAchievementsSpy = spyOn(api, "getUserAchievements");
});

afterEach(() => {
  getMyAchievementsSpy.mockRestore();
  getUserAchievementsSpy.mockRestore();
  cleanup();
});

const earnedWatching = makeAchievement({
  key: "watch-1",
  category: "watching",
  earned: true,
  points: 50,
});
const earnedStreaks = makeAchievement({
  key: "streak-1",
  category: "streaks",
  earned: true,
  points: 30,
  earnedAt: "2025-02-01T00:00:00.000Z",
});
const inProgressWatching = makeAchievement({
  key: "watch-2",
  category: "watching",
  earned: false,
  earnedAt: null,
  earnedCount: 0,
  lastEarnedAt: null,
  progress: 5,
  threshold: 10,
  points: 100,
  rarity: null,
});

describe("AchievementsPage — own profile", () => {
  test("renders 'Achievements' kicker", async () => {
    getMyAchievementsSpy.mockImplementation(() =>
      Promise.resolve([earnedWatching]),
    );

    render(<AchievementsPage />, { wrapper: OwnWrapper });

    await waitFor(() => {
      expect(screen.getByText("Achievements")).toBeDefined();
    });
  });

  test("shows earned/total/XP summary chip", async () => {
    getMyAchievementsSpy.mockImplementation(() =>
      Promise.resolve([earnedWatching, inProgressWatching]),
    );

    render(<AchievementsPage />, { wrapper: OwnWrapper });

    await waitFor(() => {
      // 1 earned out of 2 total, 50 XP
      expect(screen.getByText("1/2 earned · 50 XP")).toBeDefined();
    });
  });

  test("NextUpStrip section is visible for own profile when in-progress badges exist", async () => {
    getMyAchievementsSpy.mockImplementation(() =>
      Promise.resolve([earnedWatching, inProgressWatching]),
    );

    render(<AchievementsPage />, { wrapper: OwnWrapper });

    await waitFor(() => {
      expect(screen.getByText("Next up")).toBeDefined();
    });
  });

  test("category filter chip 'Watching' filters grid to only watching category", async () => {
    getMyAchievementsSpy.mockImplementation(() =>
      Promise.resolve([earnedWatching, earnedStreaks]),
    );

    render(<AchievementsPage />, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={newTestClient()}>
          <MemoryRouter initialEntries={["/achievements?cat=watching"]}>
            <Routes>
              <Route path="/achievements" element={<>{children}</>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      ),
    });

    await waitFor(() => {
      expect(screen.getByText("Achievements")).toBeDefined();
    });

    // "Watching" appears in both the filter chip and the section heading (2+)
    const watchingEls = screen.getAllByText("Watching");
    expect(watchingEls.length).toBeGreaterThanOrEqual(2);

    // "Streaks" appears only in the filter chip (section heading is hidden) = 1
    const streaksEls = screen.getAllByText("Streaks");
    expect(streaksEls.length).toBe(1);
  });

  test("'All' filter (no cat param) shows all categories", async () => {
    getMyAchievementsSpy.mockImplementation(() =>
      Promise.resolve([earnedWatching, earnedStreaks]),
    );

    render(<AchievementsPage />, { wrapper: OwnWrapper });

    await waitFor(() => {
      expect(screen.getByText("Achievements")).toBeDefined();
    });

    // Both categories appear in chip + section heading = at least 2 each
    expect(screen.getAllByText("Watching").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Streaks").length).toBeGreaterThanOrEqual(2);
  });

  test("hides 'recently earned' section when no achievements are earned", async () => {
    getMyAchievementsSpy.mockImplementation(() =>
      Promise.resolve([inProgressWatching]),
    );

    render(<AchievementsPage />, { wrapper: OwnWrapper });

    await waitFor(() => {
      expect(screen.getByText("Achievements")).toBeDefined();
    });

    expect(screen.queryByText("Recently earned")).toBeNull();
  });
});

describe("AchievementsPage — other user profile", () => {
  test("NextUpStrip section is hidden for other user profiles", async () => {
    getUserAchievementsSpy.mockImplementation(() =>
      Promise.resolve([earnedWatching, inProgressWatching]),
    );

    // Render as the "alice" profile view (other user)
    render(<AchievementsPage />, { wrapper: OtherWrapper });

    await waitFor(() => {
      expect(screen.getByText("Achievements")).toBeDefined();
    });

    // "Next up" section must not appear for other profiles
    expect(screen.queryByText("Next up")).toBeNull();
  });
});
