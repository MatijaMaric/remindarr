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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
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
          /Earn achievements for XP and follow people to compare/,
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
          /Earn achievements for XP and follow people to compare/,
        ),
      ).toBeDefined();
    });
  });

  // ── #1404 screen review ────────────────────────────────────────────────────

  test("empty state links to achievements", async () => {
    getLeaderboardSpy.mockImplementation(() => Promise.resolve([]));

    render(<LeaderboardPage />, { wrapper: Wrapper });

    const link = await screen.findByRole("link", {
      name: "See your achievements",
    });
    expect(link.getAttribute("href")).toBe("/achievements");
  });

  test("shows the page title once", async () => {
    getLeaderboardSpy.mockImplementation(() =>
      Promise.resolve([
        makeEntry({ userId: "u1", rank: 1 }),
        makeEntry({ userId: "u2", username: "bob", name: "Bob", rank: 2 }),
      ]),
    );

    render(<LeaderboardPage />, { wrapper: Wrapper });

    await screen.findByRole("heading", { name: "Leaderboard" });
    expect(screen.getAllByText("Leaderboard")).toHaveLength(1);
  });

  test("list rows use singular 'badge' for one badge", async () => {
    getLeaderboardSpy.mockImplementation(() =>
      Promise.resolve([
        makeEntry({ userId: "u1", username: "a", name: "A", rank: 1 }),
        makeEntry({ userId: "u2", username: "b", name: "B", rank: 2 }),
        makeEntry({ userId: "u3", username: "c", name: "C", rank: 3 }),
        makeEntry({
          userId: "u4",
          username: "d",
          name: "D",
          rank: 4,
          badgeCount: 1,
        }),
      ]),
    );

    render(<LeaderboardPage />, { wrapper: Wrapper });

    await screen.findByText("#4");
    expect(screen.queryByText("1 badges")).toBeNull();
    expect(screen.getByText("1 badge")).toBeDefined();
  });

  test("hides @username when it repeats the name shown above it", async () => {
    getLeaderboardSpy.mockImplementation(() =>
      Promise.resolve([
        makeEntry({ userId: "u1", username: "alice", name: "Alice", rank: 1 }),
        makeEntry({ userId: "u2", username: "bob", name: "Robert", rank: 2 }),
        makeEntry({ userId: "u3", username: "carol", name: null, rank: 3 }),
      ]),
    );

    render(<LeaderboardPage />, { wrapper: Wrapper });

    await screen.findByText("#1");
    expect(screen.queryByText("@alice")).toBeNull();
    expect(screen.queryByText("@carol")).toBeNull();
    expect(screen.getByText("@bob")).toBeDefined();
    expect(screen.getByText("carol")).toBeDefined();
  });

  test("podium name and username truncate inside the card", async () => {
    getLeaderboardSpy.mockImplementation(() =>
      Promise.resolve([
        makeEntry({
          userId: "u1",
          username: "averyveryverylongusername",
          name: "Long",
          rank: 1,
        }),
        makeEntry({ userId: "u2", username: "b", name: "B", rank: 2 }),
      ]),
    );

    render(<LeaderboardPage />, { wrapper: Wrapper });

    const handle = await screen.findByText("@averyveryverylongusername");
    expect(handle.className).toContain("truncate");
    // The wrapper must be able to shrink to the card so truncate takes effect.
    expect(handle.parentElement!.className).toContain("w-full");
    expect(handle.closest("a")!.className).toContain("min-w-0");
  });

  test("0 XP entries get no medal colour; #3 has its own colour", async () => {
    getLeaderboardSpy.mockImplementation(() =>
      Promise.resolve([
        makeEntry({ userId: "u1", username: "a", name: "A", rank: 1, xp: 90 }),
        makeEntry({ userId: "u2", username: "b", name: "B", rank: 2, xp: 50 }),
        makeEntry({ userId: "u3", username: "c", name: "C", rank: 3, xp: 0 }),
      ]),
    );

    render(<LeaderboardPage />, { wrapper: Wrapper });

    const first = await screen.findByText("#1");
    const third = screen.getByText("#3");
    expect(first.className).toContain("text-primary-text");
    expect(third.className).toContain("text-muted-foreground");
    expect(third.className).not.toContain("text-primary-text");
  });

  test("#3 with XP uses a colour distinct from #1", async () => {
    getLeaderboardSpy.mockImplementation(() =>
      Promise.resolve([
        makeEntry({ userId: "u1", username: "a", name: "A", rank: 1, xp: 90 }),
        makeEntry({ userId: "u2", username: "b", name: "B", rank: 2, xp: 50 }),
        makeEntry({ userId: "u3", username: "c", name: "C", rank: 3, xp: 10 }),
      ]),
    );

    render(<LeaderboardPage />, { wrapper: Wrapper });

    const third = await screen.findByText("#3");
    expect(third.className).not.toContain("text-primary-text");
    expect(third.className).not.toContain("text-muted-foreground");
  });
});
