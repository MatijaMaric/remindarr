import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router";
import { useEffect } from "react";
import type { ReactNode } from "react";
import "../i18n";

// Mutable so individual tests can override subscriptions without re-mocking
let mockSubscriptions: { providerIds: number[]; onlyMine: boolean } | null = null;

mock.module("../context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    providers: null,
    loading: false,
    subscriptions: mockSubscriptions,
    refreshSubscriptions: mock(() => Promise.resolve()),
    login: mock(() => Promise.resolve()),
    signup: mock(() => Promise.resolve()),
    logout: mock(() => Promise.resolve()),
    refresh: mock(() => Promise.resolve()),
  }),
  AuthContext: { Provider: ({ children }: { children: ReactNode }) => children },
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

mock.module("../hooks/useIsMobile", () => ({ useIsMobile: () => false }));
mock.module("../hooks/useGridNavigation", () => ({ useGridNavigation: () => undefined }));

mock.module("../components/loadFilters", () => ({
  loadFilters: () =>
    Promise.resolve({
      genres: [],
      providers: [],
      languages: [],
      regionProviderIds: [],
      priorityLanguageCodes: [],
    }),
}));

mock.module("../components/SearchBar", () => ({
  default: ({ onSearch }: any) => (
    <input data-testid="search-bar" onChange={(e) => onSearch(e.target.value)} />
  ),
}));
mock.module("../components/NewReleases", () => ({ default: () => null }));
mock.module("../components/CategoryBrowse", () => ({ default: () => null }));

const { default: BrowsePage } = await import("./BrowsePage");

function makeWrapper(initialPath: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>;
  };
}

afterEach(() => {
  cleanup();
  mockSubscriptions = null;
});

describe("BrowsePage active filter chips", () => {
  it("renders type filter chip as a <button>", () => {
    render(<BrowsePage />, { wrapper: makeWrapper("/browse?type=MOVIE") });

    const chip = screen.getByRole("button", { name: /remove movies filter/i });
    expect(chip).toBeDefined();
    expect(chip.tagName).toBe("BUTTON");
  });

  it("renders Shows type filter chip as a <button>", () => {
    render(<BrowsePage />, { wrapper: makeWrapper("/browse?type=SHOW") });

    const chip = screen.getByRole("button", { name: /remove shows filter/i });
    expect(chip.tagName).toBe("BUTTON");
  });

  it("renders genre filter chip as a <button>", () => {
    render(<BrowsePage />, { wrapper: makeWrapper("/browse?genre=Action") });

    const chip = screen.getByRole("button", { name: /remove action filter/i });
    expect(chip.tagName).toBe("BUTTON");
  });

  it("renders year range filter chip as a <button>", () => {
    render(<BrowsePage />, { wrapper: makeWrapper("/browse?yearMin=2020&yearMax=2024") });

    const chip = screen.getByRole("button", { name: /remove year range filter/i });
    expect(chip.tagName).toBe("BUTTON");
  });

  it("renders minimum rating filter chip as a <button>", () => {
    render(<BrowsePage />, { wrapper: makeWrapper("/browse?minRating=7") });

    const chip = screen.getByRole("button", { name: /remove minimum rating filter/i });
    expect(chip.tagName).toBe("BUTTON");
  });

  it("renders multiple active filter chips all as <button> elements", () => {
    render(<BrowsePage />, {
      wrapper: makeWrapper("/browse?type=SHOW&genre=Drama&minRating=8"),
    });

    const chips = screen.getAllByRole("button", { name: /remove .* filter/i });
    expect(chips.length).toBe(3);
    for (const chip of chips) {
      expect(chip.tagName).toBe("BUTTON");
    }
  });

  it("clicking a type chip removes the Movies filter from the page", () => {
    render(<BrowsePage />, { wrapper: makeWrapper("/browse?type=MOVIE&genre=Action") });

    const moviesChip = screen.getByRole("button", { name: /remove movies filter/i });
    expect(moviesChip).toBeDefined();

    act(() => { fireEvent.click(moviesChip); });

    // After removing the Movies filter, the Movies chip should be gone
    expect(screen.queryByRole("button", { name: /remove movies filter/i })).toBeNull();
    // Genre chip for Action should still be present
    expect(screen.getByRole("button", { name: /remove action filter/i })).toBeDefined();
  });
});

describe("BrowsePage subscription preselect", () => {
  // Helper that captures the current URLSearchParams from inside the router tree
  function SearchParamsSpy({ onCapture }: { onCapture: (p: URLSearchParams) => void }) {
    const [sp] = useSearchParams();
    useEffect(() => { onCapture(sp); }, [sp, onCapture]);
    return null;
  }

  it("preselects subscribed providers when no provider param in URL", async () => {
    mockSubscriptions = { providerIds: [8, 337], onlyMine: false };

    let captured: URLSearchParams | null = null;

    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/browse"]}>
          <BrowsePage />
          <SearchParamsSpy onCapture={(sp) => { captured = sp; }} />
        </MemoryRouter>
      );
    });

    expect(captured?.get("provider")).toBe("8,337");
  });

  it("does not overwrite an existing provider param in the URL", async () => {
    mockSubscriptions = { providerIds: [8, 337], onlyMine: false };

    let captured: URLSearchParams | null = null;

    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/browse?provider=15"]}>
          <BrowsePage />
          <SearchParamsSpy onCapture={(sp) => { captured = sp; }} />
        </MemoryRouter>
      );
    });

    // The existing provider=15 should be preserved, not overwritten
    expect(captured?.get("provider")).toBe("15");
  });

  it("does not preselect when user has no subscriptions", async () => {
    mockSubscriptions = null;

    let captured: URLSearchParams | null = null;

    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/browse"]}>
          <BrowsePage />
          <SearchParamsSpy onCapture={(sp) => { captured = sp; }} />
        </MemoryRouter>
      );
    });

    expect(captured?.get("provider")).toBeNull();
  });
});
