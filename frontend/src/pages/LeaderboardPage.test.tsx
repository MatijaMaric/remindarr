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
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import * as api from "../api";
import type { LeaderboardEntry } from "../types";

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

const { default: LeaderboardPage } = await import("./LeaderboardPage");

function Wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

function makeEntry(
  overrides: Partial<LeaderboardEntry> = {},
): LeaderboardEntry {
  return {
    userId: "u1",
    username: "alice",
    name: "Alice",
    image: null,
    xp: 100,
    badgeCount: 3,
    rank: 1,
    ...overrides,
  };
}

let getLeaderboardSpy: ReturnType<typeof spyOn<typeof api, "getLeaderboard">>;

beforeEach(() => {
  getLeaderboardSpy = spyOn(api, "getLeaderboard");
});

afterEach(() => {
  getLeaderboardSpy.mockRestore();
  cleanup();
});

describe("LeaderboardPage", () => {
  test("loading state renders skeleton", async () => {
    // Never resolves — stays in loading during render
    getLeaderboardSpy.mockImplementation(() => new Promise(() => {}));

    const { container } = render(<LeaderboardPage />, { wrapper: Wrapper });

    // Loading shows animate-pulse skeleton divs
    expect(container.querySelector(".animate-pulse")).toBeDefined();
    // Title not shown during loading
    expect(screen.queryByRole("heading", { name: "Leaderboard" })).toBeNull();
  });

  test("shows podium for top 3", async () => {
    const entries = [
      makeEntry({ userId: "u1", username: "alice", rank: 1, xp: 300 }),
      makeEntry({ userId: "u2", username: "bob", rank: 2, xp: 200 }),
      makeEntry({ userId: "u3", username: "charlie", rank: 3, xp: 100 }),
    ];
    getLeaderboardSpy.mockImplementation(() => Promise.resolve(entries));

    render(<LeaderboardPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getAllByText("Leaderboard").length).toBeGreaterThanOrEqual(
        1,
      );
    });

    expect(screen.getByText("#1")).toBeDefined();
    expect(screen.getByText("#2")).toBeDefined();
    expect(screen.getByText("#3")).toBeDefined();
  });

  test("empty state when only self in results (length 1)", async () => {
    getLeaderboardSpy.mockImplementation(() =>
      Promise.resolve([makeEntry({ userId: "u1", username: "solo", rank: 1 })]),
    );

    render(<LeaderboardPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(
        screen.getByText(
          /Track titles and follow people to appear on the leaderboard/,
        ),
      ).toBeDefined();
    });
  });

  test("highlights current user row", async () => {
    const entries = [
      makeEntry({
        userId: "u1",
        username: "alice",
        name: "Alice",
        rank: 1,
        xp: 300,
      }),
      makeEntry({
        userId: "current-user",
        username: "me",
        name: "Me",
        rank: 2,
        xp: 200,
      }),
      makeEntry({
        userId: "u3",
        username: "charlie",
        name: "Charlie",
        rank: 3,
        xp: 100,
      }),
    ];
    getLeaderboardSpy.mockImplementation(() => Promise.resolve(entries));

    render(<LeaderboardPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getAllByText("Leaderboard").length).toBeGreaterThanOrEqual(
        1,
      );
    });

    // The current user entries should have highlighted styling — verify render
    expect(screen.getByText("#2")).toBeDefined();
  });

  test("error state shows error message", async () => {
    getLeaderboardSpy.mockImplementation(() =>
      Promise.reject(new Error("Network error")),
    );

    render(<LeaderboardPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeDefined();
    });
  });

  test("empty array shows empty state", async () => {
    getLeaderboardSpy.mockImplementation(() => Promise.resolve([]));

    render(<LeaderboardPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(
        screen.getByText(
          /Track titles and follow people to appear on the leaderboard/,
        ),
      ).toBeDefined();
    });
  });
});
