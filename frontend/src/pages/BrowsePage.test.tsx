import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import "../i18n";

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

// Stub out child components that make API calls or have complex browser deps.
// We do not mock ../api here to avoid leaking into other test files — the only
// on-mount API call (getLanguages) is silently swallowed by the component on failure.
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
