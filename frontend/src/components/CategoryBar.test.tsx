import { describe, it, expect, afterEach, mock } from "bun:test";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "../i18n";
import CategoryBar from "./CategoryBar";

afterEach(cleanup);

describe("CategoryBar", () => {
  it("labels each pill like the list heading it opens", () => {
    render(<CategoryBar category="popular" onCategoryChange={() => {}} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Popular",
      "Upcoming",
      "Top Rated",
      "New Releases",
    ]);
  });

  it("reports the picked category", () => {
    const onChange = mock(() => {});
    render(<CategoryBar category="popular" onCategoryChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "New Releases" }));
    expect(onChange).toHaveBeenCalledWith("new_releases");
  });
});
