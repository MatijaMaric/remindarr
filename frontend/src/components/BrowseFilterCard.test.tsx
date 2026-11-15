import { describe, it, expect, afterEach, mock } from "bun:test";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "../i18n";
import BrowseFilterCard from "./BrowseFilterCard";

afterEach(cleanup);

function renderCard(props: Partial<Parameters<typeof BrowseFilterCard>[0]>) {
  return render(
    <BrowseFilterCard
      genre={[]}
      onGenreChange={() => {}}
      genres={[]}
      provider={[]}
      onProviderChange={() => {}}
      providers={[{ id: 8, name: "Netflix" }]}
      yearMin=""
      yearMax=""
      onYearChange={() => {}}
      minRating=""
      onMinRatingChange={() => {}}
      type={[]}
      onTypeChange={() => {}}
      language={[]}
      onLanguageChange={() => {}}
      languages={["ja", "ko"]}
      onClearFilters={() => {}}
      {...props}
    />,
  );
}

describe("BrowseFilterCard", () => {
  it("in single-language mode a new pick replaces the previous one", () => {
    const onLanguageChange = mock((_: string[]) => {});
    renderCard({ language: ["ja"], singleLanguage: true, onLanguageChange });
    fireEvent.click(screen.getByRole("button", { name: /Japanese/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Korean" }));
    expect(onLanguageChange).toHaveBeenLastCalledWith(["ko"]);
  });

  it("in multi-language mode picks add up", () => {
    const onLanguageChange = mock((_: string[]) => {});
    renderCard({ language: ["ja"], onLanguageChange });
    fireEvent.click(screen.getByRole("button", { name: /Japanese/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Korean" }));
    expect(onLanguageChange).toHaveBeenLastCalledWith(["ja", "ko"]);
  });

  it("with a days toggle hides the year and rating fields", () => {
    const onDaysBackChange = mock((_: number) => {});
    renderCard({ daysBack: 30, onDaysBackChange });
    expect(screen.queryByText("Year")).toBeNull();
    expect(screen.queryByText("Min. rating")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "90d" }));
    expect(onDaysBackChange).toHaveBeenCalledWith(90);
  });

  it("offers Owned by me when asked and names it in the summary", () => {
    renderCard({ showOwned: true, provider: ["owned"] });
    expect(screen.getByRole("button", { name: /Owned by me/ })).toBeTruthy();
  });

  it("shows the On my services toggle only when it can change", () => {
    const onOnlyMineChange = mock((_: boolean) => {});
    const { unmount } = renderCard({ onlyMine: true, onOnlyMineChange });
    const toggle = screen.getByRole("button", { name: /On my services/ });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    expect(onOnlyMineChange).toHaveBeenCalledWith(false);
    unmount();
    renderCard({});
    expect(screen.queryByRole("button", { name: /On my services/ })).toBeNull();
  });
});
