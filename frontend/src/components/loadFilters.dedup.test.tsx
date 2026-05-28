import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, cleanup, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { loadFilters } from "./loadFilters";

const mockGetGenres = mock(async () => ({
  genres: [] as string[],
}));
const mockGetProviders = mock(async () => ({
  providers: [],
  regionProviderIds: [] as number[],
}));
const mockGetLanguages = mock(async () => ({
  languages: [] as string[],
  priorityLanguageCodes: [] as string[],
}));

mock.module("../api", () => ({
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
  mockGetGenres.mockReset();
  mockGetProviders.mockReset();
  mockGetLanguages.mockReset();
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
