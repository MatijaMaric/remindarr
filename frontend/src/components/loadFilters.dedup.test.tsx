import { describe, it, expect, afterEach } from "bun:test";
import { render, cleanup, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { apiMock, resetApiMock } from "../test-utils/apiMock";
import { loadFilters } from "./loadFilters";

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
  resetApiMock();
});

describe("filters shared-cache dedup", () => {
  it("fetches filters once when two consumers share the ['filters'] key", async () => {
    apiMock.getGenres.mockResolvedValue({ genres: ["Action"] });
    apiMock.getProviders.mockResolvedValue({
      providers: [],
      regionProviderIds: [],
    });
    apiMock.getLanguages.mockResolvedValue({
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

    await waitFor(() => expect(apiMock.getGenres).toHaveBeenCalledTimes(1));
    // Two simultaneous consumers, one shared key → loadFilters runs once,
    // so each underlying endpoint is hit exactly once (was 2× before the shared cache).
    expect(apiMock.getProviders).toHaveBeenCalledTimes(1);
    expect(apiMock.getLanguages).toHaveBeenCalledTimes(1);
  });
});
