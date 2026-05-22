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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "../../api";

mock.module("../../i18n", () => ({}));

const { default: SuggestionsRow } = await import("./SuggestionsRow");

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

const mockTitles = [
  {
    id: "movie-1",
    title: "Movie One",
    posterUrl: null,
    releaseYear: 2024,
    object_type: "MOVIE",
  },
  {
    id: "movie-2",
    title: "Movie Two",
    posterUrl: null,
    releaseYear: 2023,
    object_type: "MOVIE",
  },
];

let getSuggestionsSpy: ReturnType<
  typeof spyOn<typeof api, "getTitleSuggestions">
>;

beforeEach(() => {
  getSuggestionsSpy = spyOn(api, "getTitleSuggestions");
});

afterEach(() => {
  getSuggestionsSpy.mockRestore();
  cleanup();
});

describe("SuggestionsRow", () => {
  test("renders loading skeletons while fetching", () => {
    getSuggestionsSpy.mockImplementation(() => new Promise(() => {}));

    render(<SuggestionsRow titleId="movie-1" type="movie" />, {
      wrapper: Wrapper,
    });

    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  test("renders title list on success", async () => {
    getSuggestionsSpy.mockResolvedValue({
      titles: mockTitles as any,
      page: 1,
      totalPages: 1,
      totalResults: 2,
    });

    render(<SuggestionsRow titleId="movie-1" type="movie" />, {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(screen.getByText("Movie One")).toBeDefined();
      expect(screen.getByText("Movie Two")).toBeDefined();
    });
  });

  test("returns null when titles are empty after loading", async () => {
    getSuggestionsSpy.mockResolvedValue({
      titles: [],
      page: 1,
      totalPages: 0,
      totalResults: 0,
    });

    const { container } = render(
      <SuggestionsRow titleId="movie-1" type="movie" />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(getSuggestionsSpy).toHaveBeenCalled();
    });

    // After loading with empty results, component returns null
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});
