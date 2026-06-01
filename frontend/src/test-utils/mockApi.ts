import { mock } from "bun:test";

// Shared `../api` mock surface for filter/browse-related tests.
//
// bun's `mock.module` is process-global: a registration for a specifier stays
// active across files, and a module-under-test (e.g. `components/loadFilters.ts`,
// which does `import * as api from "../api"`) caches its api binding at the first
// import. If two test files declare their *own separate* mock instances for the
// same functions, whichever file imports the module-under-test first wins the
// cached binding — so the other file's `toHaveBeenCalledTimes(...)` assertions
// observe the wrong instance (0 calls). Likewise, an incomplete `../api` mock
// that leaks into a file rendering a component that calls some other api function
// leaves that function `undefined`.
//
// To neutralise both, every filter/browse test mocks `../api` by spreading
// `apiMockStubs` (complete benign defaults for the realistic cross-leak surface)
// and the two `loadFilters`-exercising files additionally share the SAME
// `mockGetGenres/Providers/Languages` instances exported here.

// Shared singleton instances for the three functions `loadFilters` calls.
// Both NewReleases.test.ts and loadFilters.dedup.test.tsx import these, so the
// cached `loadFilters` binding always calls the instance both files assert on.
export const mockGetGenres = mock(async () => ({ genres: [] as string[] }));
export const mockGetProviders = mock(async () => ({
  providers: [] as { id: number; name: string }[],
  regionProviderIds: [] as number[],
}));
export const mockGetLanguages = mock(async () => ({
  languages: [] as string[],
  priorityLanguageCodes: [] as string[],
}));

// Clears call counts AND implementations of the shared filter mocks between
// tests (matching the prior `mockReset()` semantics — every test sets its own
// `mockResolvedValue`/`mockRejectedValue` before awaiting `loadFilters`).
export function resetFilterMocks() {
  mockGetGenres.mockReset();
  mockGetProviders.mockReset();
  mockGetLanguages.mockReset();
}

// Complete, benign stub surface so any leaked-in `../api` mock still leaves every
// function these tests' components touch defined and returning a valid shape.
// Covers the union of api functions reached by loadFilters / NewReleases /
// BrowsePage / CategoryBrowse — not the full ~150-export api module.
export const apiMockStubs = {
  getGenres: mockGetGenres,
  getProviders: mockGetProviders,
  getLanguages: mockGetLanguages,
  getTitles: mock(async () => ({ titles: [], count: 0 })),
  searchTitles: mock(async () => ({ titles: [], count: 0 })),
  browseTitles: mock(async () => ({
    titles: [],
    page: 1,
    totalPages: 1,
    totalResults: 0,
  })),
  resolveImdb: mock(async () => null),
};
