import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { SuggestionsAggregateResponse, SearchTitle } from "../types";
import "../i18n";
import * as api from "../api";
import SuggestedForYouRow from "./SuggestedForYouRow";

function makeSearchTitle(id: string): SearchTitle {
  return {
    id,
    objectType: "MOVIE" as const,
    title: `Title ${id}`,
    originalTitle: null,
    releaseYear: 2024,
    releaseDate: null,
    runtimeMinutes: null,
    shortDescription: null,
    genres: [],
    imdbId: null,
    tmdbId: "1",
    posterUrl: null,
    ageCertification: null,
    originalLanguage: "en",
    tmdbUrl: null,
    offers: [],
    scores: { imdbScore: null, imdbVotes: null, tmdbScore: 7.5 },
  };
}

let mockGetSuggestionsAggregate: ReturnType<typeof spyOn>;

beforeEach(() => {
  mockGetSuggestionsAggregate = spyOn(api, "getSuggestionsAggregate").mockResolvedValue(
    { flat: [], groups: [] } as unknown as SuggestionsAggregateResponse,
  );
});

afterEach(() => {
  cleanup();
  mockGetSuggestionsAggregate.mockRestore();
});

function newTestClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("SuggestedForYouRow", () => {
  it("calls getSuggestionsAggregate exactly once on mount", async () => {
    mockGetSuggestionsAggregate.mockResolvedValue(
      { flat: [makeSearchTitle("s1"), makeSearchTitle("s2")], groups: [] } as unknown as SuggestionsAggregateResponse,
    );

    render(<SuggestedForYouRow />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Title s1")).toBeDefined();
    });

    expect(mockGetSuggestionsAggregate).toHaveBeenCalledTimes(1);
  });

  it("does not re-call getSuggestionsAggregate on parent re-render", async () => {
    mockGetSuggestionsAggregate.mockResolvedValue(
      { flat: [makeSearchTitle("s1")], groups: [] } as unknown as SuggestionsAggregateResponse,
    );

    function Parent() {
      return <SuggestedForYouRow />;
    }

    const { rerender } = render(<Parent />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Title s1")).toBeDefined();
    });

    const callsAfterMount = mockGetSuggestionsAggregate.mock.calls.length;
    rerender(<Parent />);

    await waitFor(() => {
      expect(mockGetSuggestionsAggregate.mock.calls.length).toBe(callsAfterMount);
    });
  });

  it("renders nothing when data is empty", async () => {
    const { container } = render(<SuggestedForYouRow />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(mockGetSuggestionsAggregate).toHaveBeenCalledTimes(1);
    });

    expect(container.firstChild).toBeNull();
  });
});
