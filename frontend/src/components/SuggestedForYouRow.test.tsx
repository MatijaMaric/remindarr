import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { SuggestionsAggregateResponse, SearchTitle } from "../types";
import "../i18n";

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

const mockGetSuggestionsAggregate = mock<() => Promise<SuggestionsAggregateResponse>>(() =>
  Promise.resolve({ flat: [], groups: [] }),
);

mock.module("../api", () => ({
  getSuggestionsAggregate: mockGetSuggestionsAggregate,
}));

const { default: SuggestedForYouRow } = await import("./SuggestedForYouRow");

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

afterEach(() => {
  cleanup();
  mockGetSuggestionsAggregate.mockReset();
  mockGetSuggestionsAggregate.mockImplementation(() =>
    Promise.resolve({ flat: [], groups: [] }),
  );
});

describe("SuggestedForYouRow", () => {
  it("calls getSuggestionsAggregate exactly once on mount", async () => {
    mockGetSuggestionsAggregate.mockImplementation(() =>
      Promise.resolve({ flat: [makeSearchTitle("s1"), makeSearchTitle("s2")], groups: [] }),
    );

    render(<SuggestedForYouRow />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Title s1")).toBeDefined();
    });

    expect(mockGetSuggestionsAggregate).toHaveBeenCalledTimes(1);
  });

  it("does not re-call getSuggestionsAggregate on parent re-render", async () => {
    mockGetSuggestionsAggregate.mockImplementation(() =>
      Promise.resolve({ flat: [makeSearchTitle("s1")], groups: [] }),
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
    mockGetSuggestionsAggregate.mockImplementation(() =>
      Promise.resolve({ flat: [], groups: [] }),
    );

    const { container } = render(<SuggestedForYouRow />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(mockGetSuggestionsAggregate).toHaveBeenCalledTimes(1);
    });

    expect(container.firstChild).toBeNull();
  });
});
