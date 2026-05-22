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
import type { MovieDetailsResponse, ShowDetailsResponse } from "../types";

// Mock MovieDetail and ShowDetail to avoid complex data requirements
// (component stubs — lower risk than function mocks, kept as mock.module)
mock.module("./title/MovieDetail", () => ({
  default: () => <div data-testid="movie-detail">MovieDetail</div>,
}));

mock.module("./title/ShowDetail", () => ({
  default: () => <div data-testid="show-detail">ShowDetail</div>,
}));

const { default: TitleDetailPage } = await import("./TitleDetailPage");

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function makeWrapper(titleId: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={newTestClient()}>
        <MemoryRouter initialEntries={[`/title/${titleId}`]}>
          <Routes>
            <Route path="/title/:id" element={<>{children}</>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

const mockMovieTitle = {
  id: "movie-1",
  title: "Test Movie",
  object_type: "MOVIE" as const,
};

const movieResponse = {
  title: mockMovieTitle,
  tmdb: null,
  country: "US",
} as unknown as MovieDetailsResponse;

const showResponse = {
  title: {
    ...mockMovieTitle,
    id: "tv-1",
    title: "Test Show",
    object_type: "SHOW",
  },
  tmdb: null,
  country: "US",
} as unknown as ShowDetailsResponse;

let getMovieSpy: ReturnType<typeof spyOn<typeof api, "getMovieDetails">>;
let getShowSpy: ReturnType<typeof spyOn<typeof api, "getShowDetails">>;

beforeEach(() => {
  getMovieSpy = spyOn(api, "getMovieDetails");
  getShowSpy = spyOn(api, "getShowDetails");
});

afterEach(() => {
  getMovieSpy.mockRestore();
  getShowSpy.mockRestore();
  cleanup();
});

describe("TitleDetailPage", () => {
  test("renders skeleton on load", () => {
    getMovieSpy.mockImplementation(() => new Promise(() => {}));
    const Wrapper = makeWrapper("movie-1");
    render(<TitleDetailPage />, { wrapper: Wrapper });
    // skeleton renders immediately with animate-pulse elements
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  test("renders MovieDetail for movie id", async () => {
    getMovieSpy.mockResolvedValue(movieResponse);
    const Wrapper = makeWrapper("movie-1");
    render(<TitleDetailPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByTestId("movie-detail")).toBeDefined();
    });
  });

  test("renders ShowDetail for tv id", async () => {
    getShowSpy.mockResolvedValue(showResponse);
    const Wrapper = makeWrapper("tv-1");
    render(<TitleDetailPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByTestId("show-detail")).toBeDefined();
    });
  });

  test("renders error message on failure", async () => {
    getMovieSpy.mockRejectedValue(new Error("Not found"));
    const Wrapper = makeWrapper("movie-1");
    render(<TitleDetailPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Not found")).toBeDefined();
    });
  });
});
