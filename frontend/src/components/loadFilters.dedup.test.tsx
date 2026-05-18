import { describe, it, expect, afterEach, spyOn } from "bun:test";
import { render, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import * as api from "../api";
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

let spies: ReturnType<typeof spyOn>[] = [];

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("filters shared-cache dedup", () => {
  it("fetches filters once when two consumers share the ['filters'] key", async () => {
    const getGenres = spyOn(api, "getGenres").mockResolvedValue({ genres: ["Action"] } as any);
    const getProviders = spyOn(api, "getProviders").mockResolvedValue({ providers: [] } as any);
    const getLanguages = spyOn(api, "getLanguages").mockResolvedValue({ languages: ["en"] } as any);
    spies = [getGenres, getProviders, getLanguages];

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <FiltersConsumer />
        <FiltersConsumer />
      </QueryClientProvider>
    );

    await waitFor(() => expect(getGenres).toHaveBeenCalledTimes(1));
    // Two simultaneous consumers, one shared key → loadFilters runs once,
    // so each underlying endpoint is hit exactly once (was 2× before the shared cache).
    expect(getProviders).toHaveBeenCalledTimes(1);
    expect(getLanguages).toHaveBeenCalledTimes(1);
  });
});
