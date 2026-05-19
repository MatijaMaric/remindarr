import { describe, it, expect, afterEach, beforeEach, spyOn } from "bun:test";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import * as api from "../api";
import { AuthContext } from "../context/AuthContext";
import CategoryBrowse from "./CategoryBrowse";

let intersectionCallback: IntersectionObserverCallback | null = null;

class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(globalThis, "IntersectionObserver", {
  value: MockIntersectionObserver,
  writable: true,
  configurable: true,
});

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

function makeSearchTitle(i: number) {
  return {
    id: `t${i}`,
    objectType: "MOVIE" as const,
    title: `Title ${i}`,
    originalTitle: null,
    releaseYear: 2026,
    releaseDate: "2026-01-01",
    runtimeMinutes: 120,
    shortDescription: null,
    genres: [],
    imdbId: null,
    tmdbId: null,
    posterUrl: null,
    ageCertification: null,
    originalLanguage: "en",
    tmdbUrl: null,
    offers: [],
    scores: { imdbScore: null, imdbVotes: null, tmdbScore: 7 },
    isTracked: false,
  };
}

function makeBrowseResponse(
  page: number,
  titles: ReturnType<typeof makeSearchTitle>[],
  totalPages: number,
) {
  return {
    titles,
    page,
    totalPages,
    totalResults: titles.length * totalPages,
    availableGenres: [],
    availableProviders: [],
    availableLanguages: [],
    regionProviderIds: [],
    priorityLanguageCodes: [],
  };
}

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

function newTestClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter>
        <AuthContext value={mockAuthValue as never}>{children}</AuthContext>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [];
  intersectionCallback = null;
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  intersectionCallback = null;
});

describe("CategoryBrowse pagination", () => {
  it("keeps already-loaded titles visible while a subsequent page is fetching", async () => {
    let resolvePage2: (() => void) | null = null;
    const browseSpy = spyOn(api, "browseTitles");
    browseSpy.mockImplementationOnce(() =>
      Promise.resolve(makeBrowseResponse(1, [makeSearchTitle(1)], 2)),
    );
    browseSpy.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePage2 = () => resolve(makeBrowseResponse(2, [makeSearchTitle(2)], 2));
        }),
    );
    spies.push(browseSpy);

    render(
      <CategoryBrowse
        category="popular"
        type={[]}
        onTypeChange={() => {}}
        genre={[]}
        onGenreChange={() => {}}
        provider={[]}
        onProviderChange={() => {}}
        language={[]}
        onLanguageChange={() => {}}
        hideFilterBar
      />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(screen.getByText("Title 1")).toBeDefined();
    });

    expect(intersectionCallback).not.toBeNull();
    act(() => {
      intersectionCallback!(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    // While page 2 is in flight the existing title must stay rendered —
    // i.e. the entire list must not be replaced with the centered loader.
    await waitFor(() => {
      expect(browseSpy).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByText("Title 1")).not.toBeNull();

    resolvePage2?.();
    await waitFor(() => {
      expect(screen.getByText("Title 2")).toBeDefined();
    });
  });

  it("fires exactly one request on initial mount", async () => {
    const browseSpy = spyOn(api, "browseTitles");
    browseSpy.mockImplementation(() =>
      Promise.resolve(makeBrowseResponse(1, [makeSearchTitle(1)], 1)),
    );
    spies.push(browseSpy);

    render(
      <CategoryBrowse
        category="popular"
        type={[]}
        onTypeChange={() => {}}
        genre={[]}
        onGenreChange={() => {}}
        provider={[]}
        onProviderChange={() => {}}
        language={[]}
        onLanguageChange={() => {}}
        hideFilterBar
      />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(screen.getByText("Title 1")).toBeDefined();
    });

    expect(browseSpy).toHaveBeenCalledTimes(1);
  });

  it("does not auto-chain to page 3 after page 2 resolves without a new intersection", async () => {
    const browseSpy = spyOn(api, "browseTitles");
    browseSpy.mockResolvedValueOnce(makeBrowseResponse(1, [makeSearchTitle(1)], 3));
    browseSpy.mockResolvedValueOnce(makeBrowseResponse(2, [makeSearchTitle(2)], 3));
    spies.push(browseSpy);

    render(
      <CategoryBrowse
        category="popular"
        type={[]}
        onTypeChange={() => {}}
        genre={[]}
        onGenreChange={() => {}}
        provider={[]}
        onProviderChange={() => {}}
        language={[]}
        onLanguageChange={() => {}}
        hideFilterBar
      />,
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(screen.getByText("Title 1")).toBeDefined());

    // Explicitly trigger the scroll-to-bottom intersection → page 2
    act(() => {
      intersectionCallback!(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    await waitFor(() => expect(browseSpy).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText("Title 2")).toBeDefined());

    // After page 2 resolves, page 3 must NOT auto-load — requires another scroll
    await new Promise<void>((r) => setTimeout(r, 50));
    expect(browseSpy).toHaveBeenCalledTimes(2);
  });

  it("does not fire a duplicate request when parent re-renders with identical props", async () => {
    const browseSpy = spyOn(api, "browseTitles");
    browseSpy.mockImplementation(() =>
      Promise.resolve(makeBrowseResponse(1, [makeSearchTitle(1)], 1)),
    );
    spies.push(browseSpy);

    function Parent() {
      return (
        <CategoryBrowse
          category="popular"
          type={[]}
          onTypeChange={() => {}}
          genre={[]}
          onGenreChange={() => {}}
          provider={[]}
          onProviderChange={() => {}}
          language={[]}
          onLanguageChange={() => {}}
          hideFilterBar
        />
      );
    }

    const { rerender } = render(<Parent />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Title 1")).toBeDefined();
    });

    const callCountAfterMount = browseSpy.mock.calls.length;
    rerender(<Parent />);

    // Allow any async effects to settle
    await waitFor(() => {
      expect(browseSpy.mock.calls.length).toBe(callCountAfterMount);
    });
  });
});
