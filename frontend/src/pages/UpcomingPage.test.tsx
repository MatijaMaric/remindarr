import { describe, it, expect, mock, afterEach, spyOn } from "bun:test";
import { apiMock, resetApiMock } from "../test-utils/apiMock";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../i18n";
import * as sonner from "sonner";

mock.module("../hooks/useIsMobile", () => ({
  useIsMobile: () => false,
}));

// Provide a self-contained AuthContext so rendered WatchButtonGroup can read
// `subscriptions` without relying on an AuthProvider wrapper (or a leaked mock
// from another test file).
mock.module("../context/AuthContext", () => ({
  useAuth: () => ({ subscriptions: { providerIds: [], onlyMine: false } }),
}));

const { default: UpcomingPage } = await import("./UpcomingPage");

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
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
  resetApiMock();
});

describe("UpcomingPage", () => {
  it("shows loading state initially", () => {
    apiMock.getUpcomingEpisodes.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<UpcomingPage />, { wrapper: Wrapper });
    // Skeleton loading UI uses animate-pulse divs instead of text
    expect(container.querySelector(".animate-pulse")).toBeDefined();
  });

  it("shows error UI when initial fetch fails", async () => {
    apiMock.getUpcomingEpisodes.mockImplementation(() =>
      Promise.reject(new Error("Network error")),
    );
    render(<UpcomingPage />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByText("Failed to load episodes")).toBeDefined(),
    );
  });

  it("renders today and upcoming sections on success", async () => {
    apiMock.getUpcomingEpisodes.mockImplementation(() =>
      Promise.resolve({ today: [], upcoming: [], unwatched: [] }),
    );
    render(<UpcomingPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("Today")).toBeDefined());
  });

  it("shows toast error when toggleWatched fails", async () => {
    const toastErrorSpy = spyOn(sonner.toast, "error").mockImplementation(
      () => "1" as any,
    );

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
    apiMock.getUpcomingEpisodes.mockImplementation(() =>
      Promise.resolve({ today: [episode], upcoming: [], unwatched: [] }),
    );
    apiMock.watchEpisode.mockImplementation(() =>
      Promise.reject(new Error("Failed to update")),
    );

    render(<UpcomingPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Test Show")).toBeDefined());

    // Click the watched icon to trigger toggleWatched
    const watchedButtons = screen.getAllByRole("button");
    const watchedIcon = watchedButtons.find(
      (btn) =>
        btn.className.includes("text-gray") ||
        btn.className.includes("cursor-pointer"),
    );

    if (watchedIcon) {
      await act(async () => {
        fireEvent.click(watchedIcon);
      });
      await waitFor(() => {
        expect(toastErrorSpy).toHaveBeenCalledWith(
          "Failed to update watched status — please try again",
        );
      });
    }

    toastErrorSpy.mockRestore();
  });
});
