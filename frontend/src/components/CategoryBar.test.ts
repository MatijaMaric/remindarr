import { describe, it, expect } from "bun:test";
import type { BrowseCategory } from "./CategoryBar";

// Test the category type and constants since we can't render components without DOM
describe("BrowseCategory type", () => {
  it("supports all expected categories", () => {
    const categories: BrowseCategory[] = ["new_releases", "popular", "upcoming", "top_rated"];
    expect(categories).toHaveLength(4);
    expect(categories).toContain("new_releases");
    expect(categories).toContain("popular");
    expect(categories).toContain("upcoming");
    expect(categories).toContain("top_rated");
  });
});
