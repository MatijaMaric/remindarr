import { describe, it, expect, afterEach, beforeEach, mock } from "bun:test";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { apiMock, resetApiMock } from "../test-utils/apiMock";
import { AuthContext } from "../context/AuthContext";
import "../i18n";

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(globalThis, "ResizeObserver", {
  value: MockResizeObserver,
  writable: true,
  configurable: true,
});

const { default: NewReleases, NEW_RELEASES_PAGE_SIZE } =
  await import("./NewReleases");

function makeTitle(i: number) {
  return {
    id: `movie-${i}`,
    object_type: "MOVIE",
    title: `Release ${i}`,
    original_title: null,
    release_year: 2026,
    release_date: "2026-11-01",
    runtime_minutes: 100,
    short_description: null,
    genres: [],
    imdb_id: null,
    tmdb_id: null,
    poster_url: null,
    age_certification: null,
    original_language: "en",
    tmdb_url: null,
    imdb_score: null,
    imdb_votes: null,
    tmdb_score: null,
    is_tracked: false,
    offers: [],
  };
}
const page = (from: number, n: number) => ({
  titles: Array.from({ length: n }, (_, i) => makeTitle(from + i)),
  count: n,
});

const mockAuthValue = {
  user: null,
  providers: null,
  loading: false,
  subscriptions: null,
  refreshSubscriptions: async () => {},
  login: async () => {},
  signup: async () => {},
  logout: async () => {},
  refresh: async () => {},
};

function Wrapper({ children }: { children: ReactNode }) {
  // One client per mounted test, kept across rerenders.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthContext value={mockAuthValue as never}>{children}</AuthContext>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const props = {
  type: [],
  daysBack: 30,
  genre: [],
  provider: [],
  language: [],
};

beforeEach(resetApiMock);
afterEach(cleanup);

describe("NewReleases", () => {
  it("pages past the first 100 titles and reports the count once all are in", async () => {
    apiMock.getTitles.mockResolvedValueOnce(page(0, NEW_RELEASES_PAGE_SIZE));
    apiMock.getTitles.mockResolvedValueOnce(page(100, 5));
    const onResultsCount = mock((_: number | null) => {});
    render(<NewReleases {...props} onResultsCount={onResultsCount} />, {
      wrapper: Wrapper,
    });
    await screen.findByRole("button", { name: "Load more" });
    expect(onResultsCount).toHaveBeenLastCalledWith(null);
    expect(apiMock.getTitles.mock.calls[0][0]).toMatchObject({
      limit: 100,
      offset: 0,
    });

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    // The grid is virtualized, so check the count rather than card 105.
    await waitFor(() => expect(onResultsCount).toHaveBeenLastCalledWith(105));
    expect(apiMock.getTitles.mock.calls[1][0]).toMatchObject({ offset: 100 });
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("drops the previous count when a new request fails", async () => {
    apiMock.getTitles.mockResolvedValueOnce(page(0, 3));
    const onResultsCount = mock((_: number | null) => {});
    const view = render(
      <NewReleases {...props} onResultsCount={onResultsCount} />,
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(onResultsCount).toHaveBeenLastCalledWith(3));
    apiMock.getTitles.mockRejectedValueOnce(new Error("Server error"));
    view.rerender(
      <NewReleases {...props} daysBack={90} onResultsCount={onResultsCount} />,
    );
    await screen.findByRole("alert");
    expect(onResultsCount).toHaveBeenLastCalledWith(null);
  });

  it("shows no Load more when the first page is not full", async () => {
    apiMock.getTitles.mockResolvedValueOnce(page(0, 3));
    const onResultsCount = mock((_: number | null) => {});
    render(<NewReleases {...props} onResultsCount={onResultsCount} />, {
      wrapper: Wrapper,
    });
    await screen.findByText("Release 2");
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(onResultsCount).toHaveBeenLastCalledWith(3);
  });
});
