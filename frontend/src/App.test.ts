import { describe, it, expect } from "bun:test";
import { navLinkClass } from "./nav-utils";

describe("navLinkClass", () => {
  it("returns desktop active classes", () => {
    const result = navLinkClass(true);
    expect(result).toContain("px-4 py-2");
    expect(result).toContain("bg-indigo-600 text-white");
    expect(result).not.toContain("block w-full");
  });

  it("returns desktop inactive classes", () => {
    const result = navLinkClass(false);
    expect(result).toContain("px-4 py-2");
    expect(result).toContain("text-gray-400 hover:text-white hover:bg-gray-800");
    expect(result).not.toContain("bg-indigo-600");
  });

  it("returns mobile active classes", () => {
    const result = navLinkClass(true, true);
    expect(result).toContain("block w-full px-3 py-2.5");
    expect(result).toContain("bg-indigo-600 text-white");
    expect(result).not.toContain("px-4 py-2");
  });

  it("returns mobile inactive classes", () => {
    const result = navLinkClass(false, true);
    expect(result).toContain("block w-full px-3 py-2.5");
    expect(result).toContain("text-gray-400 hover:text-white hover:bg-gray-800");
    expect(result).not.toContain("bg-indigo-600");
  });

  it("always includes common classes", () => {
    for (const isActive of [true, false]) {
      for (const mobile of [true, false]) {
        const result = navLinkClass(isActive, mobile);
        expect(result).toContain("rounded-lg");
        expect(result).toContain("text-sm");
        expect(result).toContain("font-medium");
        expect(result).toContain("transition-colors");
      }
    }
  });
});
