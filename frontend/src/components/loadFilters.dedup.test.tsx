import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, cleanup, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  apiMockStubs,
  mockGetGenres,
  mockGetProviders,
  mockGetLanguages,
  resetFilterMocks,
} from "../test-utils/mockApi";
import { loadFilters } from "./loadFilters";

// Spread the complete stub surface (guards against cross-file leaks) and share
// the filter mock instances so the cached `loadFilters` binding calls the same
// functions this file asserts on regardless of test file execution order.
mock.module("../api", () => ({
  ...apiMockStubs,
  getGenres: mockGetGenres,
  getProviders: mockGetProviders,
  getLanguages: mockGetLanguages,
}));

// Mirrors the exact useQuery call BrowsePage and NewReleases now share.
function FiltersConsumer() {
  useQuery({
    queryKey: ["filters"],
    queryFn: ({ signal }) => loadFilters(signal),
    staleTime: Infinity,
  });
  return null;
}

afterEach(() => {
  cleanup();
  resetFilterMocks();
});

describe("filters shared-cache dedup", () => {
  it("fetches filters once when two consumers share the ['filters'] key", async () => {
    mockGetGenres.mockResolvedValue({ genres: ["Action"] });
    mockGetProviders.mockResolvedValue({
      providers: [],
      regionProviderIds: [],
    });
    mockGetLanguages.mockResolvedValue({
      languages: ["en"],
      priorityLanguageCodes: [],
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <FiltersConsumer />
        <FiltersConsumer />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(mockGetGenres).toHaveBeenCalledTimes(1));
    // Two simultaneous consumers, one shared key → loadFilters runs once,
    // so each underlying endpoint is hit exactly once (was 2× before the shared cache).
    expect(mockGetProviders).toHaveBeenCalledTimes(1);
    expect(mockGetLanguages).toHaveBeenCalledTimes(1);
  });
});
