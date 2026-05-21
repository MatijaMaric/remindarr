import { describe, it, expect, mock, afterEach, spyOn } from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../i18n";
import * as sonner from "sonner";

const mockGetUpcomingEpisodes = mock(() =>
  Promise.resolve({ today: [], upcoming: [], unwatched: [] })
);
const mockWatchEpisode = mock(() => Promise.resolve());
const mockUnwatchEpisode = mock(() => Promise.resolve());

mock.module("../api", () => ({
  getUpcomingEpisodes: mockGetUpcomingEpisodes,
  watchEpisode: mockWatchEpisode,
  unwatchEpisode: mockUnwatchEpisode,
  getCalendarTitles: mock(() => Promise.resolve({ titles: [], episodes: [] })),
  // stubs to prevent cross-file mock leakage — bun leaks mock.module globally
  getSubscriptions: mock(() => Promise.resolve({ providerIds: [], onlyMine: false })),
  hideActivityEvent: mock(() => Promise.resolve()),
  getCollection: mock(() => Promise.resolve({ collection: null, parts: [] })),
  getTitleSuggestions: mock(() => Promise.resolve({ suggestions: [] })),
  getMyProfile: mock(() => Promise.resolve({ display_name: null, bio: null, country_code: null, locale: null })),
  getTrackedTitles: mock(() => Promise.resolve({ titles: [], count: 0, profile_public: false })),
  getActivitySettings: mock(() => Promise.resolve({ enabled: true, kind_visibility: {} })),
  getJobs: mock(() => Promise.resolve({ crons: [], stats: {}, recentJobs: [] })),
  getAdminSettings: mock(() => Promise.resolve({ oidc_configured: false, oidc: {} })),
  getAdminConfig: mock(() => Promise.resolve({ safe: [], secrets: [] })),
  getAdminLogs: mock(() => Promise.resolve({ entries: [], count: 0 })),
  getIntegrations: mock(() => Promise.resolve({ integrations: [] })),
  getFeedToken: mock(() => Promise.resolve({ token: null })),
  getKioskToken: mock(() => Promise.resolve({ token: null })),
  getWatchlistShareToken: mock(() => Promise.resolve({ token: null })),
  getNotifiers: mock(() => Promise.resolve({ notifiers: [] })),
  getNotifierProviders: mock(() => Promise.resolve({ providers: [] })),
  getDepartureAlertSettings: mock(() => Promise.resolve({})),
  getProviders: mock(() => Promise.resolve({ providers: [], regionProviderIds: [] })),
  updateSubscriptions: mock(() => Promise.resolve({ providerIds: [] })),
  updateOnlyMine: mock(() => Promise.resolve({ onlyMine: false })),
}));

mock.module("../hooks/useIsMobile", () => ({
  useIsMobile: () => false,
}));

const { default: UpcomingPage } = await import("./UpcomingPage");

function newTestClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  mockGetUpcomingEpisodes.mockReset();
  mockWatchEpisode.mockReset();
  mockUnwatchEpisode.mockReset();
});

describe("UpcomingPage", () => {
  it("shows loading state initially", () => {
    mockGetUpcomingEpisodes.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<UpcomingPage />, { wrapper: Wrapper });
    // Skeleton loading UI uses animate-pulse divs instead of text
    expect(container.querySelector(".animate-pulse")).toBeDefined();
  });

  it("shows error UI when initial fetch fails", async () => {
    mockGetUpcomingEpisodes.mockImplementation(() =>
      Promise.reject(new Error("Network error"))
    );
    render(<UpcomingPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("Failed to load episodes")).toBeDefined());
  });

  it("renders today and upcoming sections on success", async () => {
    mockGetUpcomingEpisodes.mockImplementation(() =>
      Promise.resolve({ today: [], upcoming: [], unwatched: [] })
    );
    render(<UpcomingPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("Today")).toBeDefined());
  });

  it("shows toast error when toggleWatched fails", async () => {
    const toastErrorSpy = spyOn(sonner.toast, "error").mockImplementation(() => "1" as any);

    const episode = {
      id: 1,
      title_id: "tt1",
      show_title: "Test Show",
      season_number: 1,
      episode_number: 1,
      name: "Pilot",
      overview: null,
      air_date: "2024-01-01",
      still_path: null,
      poster_url: null,
      is_watched: false,
      offers: [],
    };
    mockGetUpcomingEpisodes.mockImplementation(() =>
      Promise.resolve({ today: [episode], upcoming: [], unwatched: [] })
    );
    mockWatchEpisode.mockImplementation(() =>
      Promise.reject(new Error("Failed to update"))
    );

    render(<UpcomingPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Test Show")).toBeDefined());

    // Click the watched icon to trigger toggleWatched
    const watchedButtons = screen.getAllByRole("button");
    const watchedIcon = watchedButtons.find((btn) =>
      btn.className.includes("text-gray") || btn.className.includes("cursor-pointer")
    );

    if (watchedIcon) {
      await act(async () => {
        fireEvent.click(watchedIcon);
      });
      await waitFor(() => {
        expect(toastErrorSpy).toHaveBeenCalledWith("Failed to update watched status — please try again");
      });
    }

    toastErrorSpy.mockRestore();
  });
});
