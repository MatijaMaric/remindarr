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
import type { AchievementDetail } from "../api";
import * as authCtx from "../context/AuthContext";

// Mock AuthContext so we don't need a real auth provider.
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

const { default: AchievementDetailPage } =
  await import("./AchievementDetailPage");

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function OwnWrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter initialEntries={["/achievements/movies_10"]}>
        <Routes>
          <Route path="/achievements/:key" element={<>{children}</>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function OtherWrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter initialEntries={["/u/alice/achievements/movies_10"]}>
        <Routes>
          <Route
            path="/u/:username/achievements/:key"
            element={<>{children}</>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function makeDetail(
  overrides: Partial<AchievementDetail> = {},
): AchievementDetail {
  return {
    key: "movies_10",
    kind: "count_movies",
    threshold: 10,
    points: 50,
    title: "Movie Buff",
    description: "Watch 10 movies",
    icon: "Film",
    category: "watching",
    tier: "ladder",
    repeatable: false,
    family: "movies",
    rungIndex: 0,
    progress: 10,
    earned: true,
    earnedAt: "2025-01-01T00:00:00.000Z",
    earnedCount: 1,
    lastEarnedAt: "2025-01-01T00:00:00.000Z",
    rarity: null,
    ladder: {
      rungs: [
        {
          key: "movies_10",
          title: "Movie Buff",
          threshold: 10,
          rungIndex: 0,
          points: 50,
          earned: true,
          earnedAt: "2025-01-01T00:00:00.000Z",
        },
        {
          key: "movies_50",
          title: "Movie Fan",
          threshold: 50,
          rungIndex: 1,
          points: 100,
          earned: false,
          earnedAt: null,
        },
      ],
    },
    history: [],
    ...overrides,
  };
}

let getMyDetailSpy: ReturnType<
  typeof spyOn<typeof api, "getMyAchievementDetail">
>;
let getUserDetailSpy: ReturnType<
  typeof spyOn<typeof api, "getUserAchievementDetail">
>;

beforeEach(() => {
  getMyDetailSpy = spyOn(api, "getMyAchievementDetail");
  getUserDetailSpy = spyOn(api, "getUserAchievementDetail");
});

afterEach(() => {
  getMyDetailSpy.mockRestore();
  getUserDetailSpy.mockRestore();
  cleanup();
});

describe("AchievementDetailPage — own profile", () => {
  test("shows achievement title after loading", async () => {
    getMyDetailSpy.mockImplementation(() => Promise.resolve(makeDetail()));

    render(<AchievementDetailPage />, { wrapper: OwnWrapper });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Movie Buff" })).toBeDefined();
    });
  });

  test("shows achievement description", async () => {
    getMyDetailSpy.mockImplementation(() => Promise.resolve(makeDetail()));

    render(<AchievementDetailPage />, { wrapper: OwnWrapper });

    await waitFor(() => {
      expect(screen.getByText("Watch 10 movies")).toBeDefined();
    });
  });

  test("shows ladder progress section for a ladder badge", async () => {
    getMyDetailSpy.mockImplementation(() => Promise.resolve(makeDetail()));

    render(<AchievementDetailPage />, { wrapper: OwnWrapper });

    await waitFor(() => {
      expect(screen.getByText("Ladder progress")).toBeDefined();
    });
  });

  test("does not show ladder progress section for one-shot badge", async () => {
    getMyDetailSpy.mockImplementation(() =>
      Promise.resolve(
        makeDetail({
          tier: "one-shot",
          family: null,
          rungIndex: null,
          ladder: null,
        }),
      ),
    );

    render(<AchievementDetailPage />, { wrapper: OwnWrapper });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Movie Buff" })).toBeDefined();
    });

    expect(screen.queryByText("Ladder progress")).toBeNull();
  });

  test("shows earn history section for repeatable achievements with history", async () => {
    getMyDetailSpy.mockImplementation(() =>
      Promise.resolve(
        makeDetail({
          repeatable: true,
          history: [
            { earnedAt: "2025-01-01T00:00:00.000Z", context: null },
            {
              earnedAt: "2025-02-01T00:00:00.000Z",
              context: { month: "Feb 2025" },
            },
          ],
          ladder: null,
        }),
      ),
    );

    render(<AchievementDetailPage />, { wrapper: OwnWrapper });

    await waitFor(() => {
      expect(screen.getByText("Earn history")).toBeDefined();
    });
  });

  test("does not show earn history section when history is empty", async () => {
    getMyDetailSpy.mockImplementation(() =>
      Promise.resolve(
        makeDetail({ repeatable: true, history: [], ladder: null }),
      ),
    );

    render(<AchievementDetailPage />, { wrapper: OwnWrapper });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Movie Buff" })).toBeDefined();
    });

    expect(screen.queryByText("Earn history")).toBeNull();
  });

  test("shows back link to achievements list", async () => {
    getMyDetailSpy.mockImplementation(() => Promise.resolve(makeDetail()));

    render(<AchievementDetailPage />, { wrapper: OwnWrapper });

    await waitFor(() => {
      expect(screen.getByText("All achievements")).toBeDefined();
    });
  });

  test("shows progress bar when not yet earned", async () => {
    getMyDetailSpy.mockImplementation(() =>
      Promise.resolve(
        makeDetail({
          earned: false,
          earnedAt: null,
          progress: 5,
          threshold: 10,
        }),
      ),
    );

    render(<AchievementDetailPage />, { wrapper: OwnWrapper });

    await waitFor(() => {
      expect(screen.getByText("5 / 10")).toBeDefined();
    });
  });

  test("hero shows the icon once, without repeating the title or linking to itself", async () => {
    getMyDetailSpy.mockImplementation(() =>
      Promise.resolve(
        makeDetail({ earned: false, earnedAt: null, progress: 5 }),
      ),
    );

    const { container } = render(<AchievementDetailPage />, {
      wrapper: OwnWrapper,
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Movie Buff" })).toBeDefined();
    });
    expect(screen.getAllByText("Movie Buff")).toHaveLength(1);
    expect(
      container.querySelector('a[href="/achievements/movies_10"]'),
    ).toBeNull();
    expect(screen.getByTestId("achievement-hero-icon")).toBeDefined();
    // One progress bar: the hero no longer carries its own
    expect(container.querySelectorAll('[style*="width"]')).toHaveLength(1);
  });

  test("shows the category label instead of the raw key", async () => {
    getMyDetailSpy.mockImplementation(() =>
      Promise.resolve(makeDetail({ category: "long-haul", ladder: null })),
    );

    render(<AchievementDetailPage />, { wrapper: OwnWrapper });

    await waitFor(() => {
      expect(screen.getByText("Long Haul")).toBeDefined();
    });
    expect(screen.queryByText("long-haul")).toBeNull();
  });

  test("says 'Earned' for a one-time achievement and 'First earned' for a repeatable", async () => {
    getMyDetailSpy.mockImplementation(() => Promise.resolve(makeDetail()));
    render(<AchievementDetailPage />, { wrapper: OwnWrapper });
    await waitFor(() => {
      expect(screen.getByText(/^Earned /)).toBeDefined();
    });
    expect(screen.queryByText(/First earned/)).toBeNull();
    cleanup();

    getMyDetailSpy.mockImplementation(() =>
      Promise.resolve(makeDetail({ repeatable: true, ladder: null })),
    );
    render(<AchievementDetailPage />, { wrapper: OwnWrapper });
    await waitFor(() => {
      expect(screen.getByText(/^First earned /)).toBeDefined();
    });
    cleanup();

    // The hero no longer carries the ×N chip, so the count is spelled out
    getMyDetailSpy.mockImplementation(() =>
      Promise.resolve(
        makeDetail({ repeatable: true, earnedCount: 3, ladder: null }),
      ),
    );
    render(<AchievementDetailPage />, { wrapper: OwnWrapper });
    await waitFor(() => {
      expect(screen.getByText(/^Earned 3 times · First earned /)).toBeDefined();
    });
  });

  test("capitalizes the rarity bucket", async () => {
    getMyDetailSpy.mockImplementation(() =>
      Promise.resolve(makeDetail({ rarity: { bucket: "rare", pct: 12 } })),
    );
    render(<AchievementDetailPage />, { wrapper: OwnWrapper });
    await waitFor(() => {
      expect(screen.getByText("Rare · 12% earned")).toBeDefined();
    });
  });

  test("hides ladder progress for a single-rung ladder", async () => {
    const detail = makeDetail();
    getMyDetailSpy.mockImplementation(() =>
      Promise.resolve({
        ...detail,
        ladder: { rungs: detail.ladder!.rungs.slice(0, 1) },
      }),
    );

    render(<AchievementDetailPage />, { wrapper: OwnWrapper });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Movie Buff" })).toBeDefined();
    });
    expect(screen.queryByText("Ladder progress")).toBeNull();
  });
});

describe("AchievementDetailPage — other user profile", () => {
  test("shows achievement title for another user's profile", async () => {
    getUserDetailSpy.mockImplementation(() =>
      Promise.resolve(makeDetail({ ladder: null, history: [] })),
    );

    render(<AchievementDetailPage />, { wrapper: OtherWrapper });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Movie Buff" })).toBeDefined();
    });
  });

  test("shows 'Achievement not found' on API error", async () => {
    getUserDetailSpy.mockImplementation(() =>
      Promise.reject(new Error("Not found")),
    );

    render(<AchievementDetailPage />, { wrapper: OtherWrapper });

    await waitFor(() => {
      expect(screen.getByText(/Achievement not found/)).toBeDefined();
    });
  });
});

describe("AchievementDetailPage — signed-out visitor", () => {
  let useAuthSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Simulate an unauthenticated visitor (user === null)
    useAuthSpy = spyOn(authCtx, "useAuth").mockReturnValue({
      user: null,
      providers: null,
      loading: false,
      sessionStatus: "unauthenticated",
      subscriptions: null,
      refreshSubscriptions: mock(() => Promise.resolve()),
      login: mock(() => Promise.resolve()),
      signup: mock(() => Promise.resolve()),
      logout: mock(() => Promise.resolve()),
      refresh: mock(() => Promise.resolve()),
    } as any);
  });

  afterEach(() => {
    useAuthSpy.mockRestore();
  });

  test("does not fetch without a session (routes are behind RequireAuth)", async () => {
    getUserDetailSpy.mockImplementation(() =>
      Promise.resolve(makeDetail({ ladder: null, history: [] })),
    );

    render(<AchievementDetailPage />, { wrapper: OtherWrapper });

    await new Promise((r) => setTimeout(r, 50));
    expect(getUserDetailSpy).not.toHaveBeenCalled();
  });
});
